# Sistema de ventas (POS) — pieza de muestra

Punto de venta web para un autoservicio con varias cajas y empleados.
Resuelve dos cosas: **cobrar rápido** —una venta de tres productos en efectivo,
sin tocar el mouse— y **saber qué pasó con la plata** al final del turno.

> ⚠️ **Es una pieza de muestra.** El negocio del ticket, «Autoservicio La
> Esquina», no existe. Los 400 productos, las 1.500 ventas y los cierres de caja
> son datos generados. No hay cobro real: los métodos de pago registran el
> importe, no lo procesan.

---

## Cómo se levanta

Hace falta Node 20 o más nuevo. Un solo comando, desde esta carpeta:

```bash
npm run arrancar
```

En Windows también se puede hacer doble clic en **`arrancar.bat`**.

Instala lo que falte, crea la base, carga los datos de muestra y abre el
servidor en `http://localhost:3000`. Los pasos que ya están hechos se saltea, así
que la segunda vez arranca en segundos.

PIN de acceso: **Admin 1234** · **Supervisor 2222** · **Cajero 1111**.

Al entrar no hay ninguna caja abierta: hay que abrirla con un monto inicial
antes de poder cobrar. Es a propósito — una venta sin caja no entra en ningún
arqueo.

## Los comandos

| Comando | Qué hace |
|---|---|
| `npm run arrancar` | Todo lo anterior en uno. Es el que hay que usar |
| `npm run dev` | Solo el servidor, si la base ya está |
| `npm run build` · `npm run start` | Compilar y servir compilado |
| `npm run verificar` | Tipos + lint + tests. Correr esto antes de subir |
| `npm run test` | Unitarios y de integración |
| `npm run test:cobertura` | Con cobertura: 100 % obligatorio en la lógica de dinero |
| `npm run e2e` | Los cinco flujos críticos en Chromium, a 1366×768 |
| `npm run bd:sembrar` | Regenera los datos de muestra |
| `npm run bd:reiniciar` | Borra la base y la vuelve a crear |
| `npm run bd:recalcular-stock` | Compara el stock de cada producto contra sus movimientos |

## Cómo está organizado

```
prisma/          esquema, migraciones de cada motor y el seed
scripts/         el arranque de un comando
src/app/         rutas (pantallas) y route handlers de la API
src/components/  ui/ primitivas · pos/ piezas de la pantalla de venta
src/lib/
  dinero.ts        aritmética de dinero en centavos enteros
  formato.ts       moneda, fechas y cantidades
  error-app.ts     el error de la aplicación
  reintentos.ts    reintento de transacciones que la base aborta
  motor.ts         qué base hay abajo
  servicios/       regla de negocio y transacciones
  repositorios/    único lugar que toca Prisma
  validacion/      esquemas de Zod, compartidos cliente y servidor
tests/           unitarios y de integración
e2e/             Playwright
```

Las tres capas del backend son **route handler → servicio → repositorio**, sin
saltos. No es una convención de estilo: hay reglas de ESLint que fallan si un
route handler importa Prisma, o si un componente importa un servicio. Probado
agregando el import a propósito y viendo el error.

## Las decisiones que conviene conocer antes de tocar nada

**El dinero es un entero de centavos, siempre.** No hay un solo campo decimal ni
un `parseFloat` en todo el proyecto. Las cantidades siguen la misma idea: se
guardan en milésimas de unidad (1 unidad = 1000, 1,250 kg = 1250), así lo que se
pesa tampoco pasa por coma flotante.

**El total lo recalcula el servidor.** Lo que manda el navegador son ids de
producto y cantidades; el precio sale de la base. El total que se ve en el
carrito es para el cajero, no es el que se cobra.

**El stock es un ledger.** `Producto.stockMilesimas` es un cache: la verdad es la
suma de `MovimientoStock`. `npm run bd:recalcular-stock` lo comprueba y avisa si
se desvió.

**Las ventas no se borran.** Se anulan, y eso genera los movimientos inversos de
stock y de caja.

**Toda venta es idempotente.** El navegador genera un UUID al abrir la venta; si
el pedido se reintenta, el servidor devuelve la venta ya creada en vez de cobrar
dos veces. Es lo que va a hacer seguro el modo offline cuando se implemente.

**El cierre de caja es ciego.** Hasta que el cajero no declara lo que contó, la
pantalla no muestra en ningún lado cuánto tendría que haber.

## Base de datos: dos motores, uno solo por vez

| | Cuándo | Cómo |
|---|---|---|
| **SQLite** | Por defecto. Desarrollo y demo en la PC | No hay nada que instalar |
| **PostgreSQL** | Producción, varias cajas de verdad | `MOTOR=postgresql` y `DATABASE_URL` |

```bash
MOTOR=postgresql DATABASE_URL="postgresql://usuario:clave@host/base" \
  npx prisma generate && npx prisma migrate deploy && npm run bd:sembrar
```

⚠️ **El `prisma generate` no es opcional al cambiar de motor.** El cliente que
genera Prisma lleva el motor adentro; si no se regenera, la aplicación arranca y
falla con *«The Driver Adapter is not compatible with the provider specified in
the Prisma schema»*.

Los dos caminos están **probados de punta a punta**: contra un PostgreSQL 16 real
corren los 104 tests, los 5 flujos E2E y los 9 endpoints sin un error.

Un solo esquema (`prisma/schema.prisma`, en SQLite). El de PostgreSQL se
**deriva** cambiando la línea del `provider` — Prisma no acepta
`provider = env(...)`, probado— para que no haya dos archivos que se
desincronicen. Cada motor tiene su carpeta de migraciones, porque el SQL que
genera uno no es válido en el otro.

### Lo que hay que saber de cada motor

**PostgreSQL aborta transacciones, no las hace esperar.** Con aislamiento
`Serializable`, dos cajas cobrando a la vez hacen que PostgreSQL tumbe una con
`40001` y espere que se reintente. Por eso existe `src/lib/reintentos.ts`. En
SQLite no pasa nunca —escribe de a una— así que este bug **solo aparece
corriendo contra PostgreSQL**.

**El número de venta sale de una secuencia en PostgreSQL** y de una fila de
contador en SQLite. Una fila actualizada dentro de una transacción
`Serializable` es un punto caliente: con veinte ventas simultáneas se agotan los
reintentos. Medido. La secuencia puede dejar huecos si una transacción se anula,
y eso está bien: lo que no puede pasar es que dos ventas compartan número.

**`?schema=` en la URL no lo aplica el adaptador.** Hay que leerlo y pasárselo,
y además fijar el `search_path` de la conexión, porque la opción del adaptador
solo alcanza a las consultas generadas y no a las crudas.

### 🔴 Cloudflare D1 no sirve para este sistema

No es una opinión. Lo dice el propio adaptador de Prisma, en su código:

> *D1 does not support transactions yet. When using Prisma's D1 adapter,
> implicit & explicit transactions will be ignored and run as individual
> queries, which breaks the guarantees of the ACID properties of transactions.*

Una venta se crea entera dentro de una transacción. Sobre D1 esa transacción se
ignora: un corte a mitad de camino dejaría la venta cobrada sin ítems, o el
stock descontado sin venta. Es exactamente el bug que este proyecto existe para
evitar. **Para desplegarlo hace falta PostgreSQL**, no D1.

## La pantalla de venta

Es la única que tiene que ser rápida. El buscador está enfocado siempre —el
lector de códigos es un teclado y escribe donde esté el foco—, el catálogo entero
se carga en memoria al iniciar sesión, y no hay ni un modal de confirmación en el
camino del cobro.

| Tecla | Acción |
|---|---|
| `Enter` | Agregar el producto encontrado / confirmar el cobro |
| `F2` | Ir a cobrar |
| `F3` | Limpiar la búsqueda |
| `F4` | Editar el peso del ítem seleccionado |
| `F7` | Cargar un producto por peso |
| `F8` | Descuento manual (pide PIN de supervisor) |
| `F9` | Suspender la venta y empezar otra |
| `Esc` | Cancelar la venta / volver desde el cobro |
| `↑` `↓` | Mover la selección en el carrito |
| `+` `-` | Sumar o restar cantidad |

En el cobro, `Enter` con el campo vacío cobra el importe justo en efectivo: es el
camino de una sola tecla para el caso más común del mostrador.

## Lo que falta

- **Modo offline con cola de sincronización** (Dexie + PWA). Es el diferencial
  más fuerte para vender y todavía no está. El modelo ya lo soporta: la
  idempotencia está implementada y probada.
- **Devoluciones parciales y cuenta corriente de clientes.** El modelo tiene las
  tablas; falta la pantalla.
- **Facturación electrónica.** Fuera de alcance. El modelo queda preparado para
  agregar `tipo_comprobante`, `punto_venta`, `numero_comprobante`, `cae` y
  `cae_vencimiento` a `Venta`.
- **El ticket no se probó contra una impresora térmica real.** El ancho de 80mm
  se respeta en la vista previa del navegador, pero el corte de papel y los
  márgenes del cabezal solo se ven imprimiendo.
- **El límite de peticiones es un contador en memoria del proceso.** Alcanza para
  un comercio con una sola instancia. Con varias instancias hay que moverlo a
  Redis o a la base, o el límite deja de valer.
- **E2E offline.** Es el único de los cinco flujos críticos que no está: no se
  puede probar algo que no existe.
