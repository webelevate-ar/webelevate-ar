# Sistema de ventas (POS) — pieza de muestra

Punto de venta web para un autoservicio con varias cajas y empleados.
Resuelve dos cosas: **cobrar rápido** —una venta de tres productos en efectivo,
sin tocar el mouse— y **saber qué pasó con la plata** al final del turno.

> ⚠️ **Es una pieza de muestra.** El negocio del ticket, «Autoservicio La
> Esquina», no existe. Los 400 productos, las 1.500 ventas y las 45 sesiones de
> caja son datos generados. No hay cobro real: los métodos de pago registran el
> importe, no lo procesan.

---

## Cómo se levanta

Hace falta Node 22 o más nuevo. Desde esta carpeta:

```bash
npm install
npx prisma migrate deploy    # crea prisma/dev.db
npm run bd:sembrar           # 400 productos, 1.500 ventas, 45 cierres de caja
npm run dev                  # http://localhost:3000
```

PIN de acceso: **Admin 1234** · **Supervisor 2222** · **Cajero 1111**.

Al entrar no hay ninguna caja abierta: hay que abrirla con un monto inicial
antes de poder cobrar. Es a propósito — una venta sin caja no entra en ningún
arqueo.

## Los comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo |
| `npm run build` | Genera el cliente de Prisma y compila |
| `npm run start` | Sirve el build compilado |
| `npm run verificar` | Tipos + lint + tests. Es lo que hay que correr antes de subir |
| `npm run test` | Tests unitarios y de integración |
| `npm run test:cobertura` | Los mismos, con cobertura (100 % obligatorio en la lógica de dinero) |
| `npx playwright test` | Los cinco flujos E2E, contra el build, a 1366×768 |
| `npm run bd:sembrar` | Regenera los datos de muestra |
| `npm run bd:reiniciar` | Borra la base y la vuelve a crear |
| `npm run bd:recalcular-stock` | Compara el stock de cada producto contra sus movimientos |

## Cómo está organizado

```
prisma/          esquema, migraciones y el seed
src/app/         rutas (pantallas) y route handlers de la API
src/components/  ui/ primitivas · pos/ piezas de la pantalla de venta
src/lib/
  dinero.ts        aritmética de dinero en centavos enteros
  formato.ts       moneda, fechas y cantidades
  error-app.ts     el error de la aplicación
  servicios/       regla de negocio y transacciones
  repositorios/    único lugar que toca Prisma
  validacion/      esquemas de Zod, compartidos cliente y servidor
tests/           unitarios y de integración
e2e/             Playwright
```

Las tres capas del backend son **route handler → servicio → repositorio**, sin
saltos. No es una convención de estilo: hay reglas de ESLint que fallan el build
si un route handler importa Prisma, o si un componente importa un servicio.
Probado: quitar la regla y agregar el import da error de lint.

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

## Base de datos

En desarrollo, SQLite (`prisma/dev.db`). El motor está aislado en el adaptador de
`src/lib/prisma.ts`: para pasar a PostgreSQL se cambia `PrismaBetterSqlite3` por
`PrismaPg`, se cambia el `provider` del esquema y se regeneran las migraciones.

Dos cosas de SQLite que hay que saber, porque las dos mordieron:

- **Guarda las fechas como texto ISO, no como milisegundos.** Las funciones de
  fecha van sobre la columna tal cual (`date(creado_en, 'localtime')`).
- **`SUM()` y `COUNT()` vuelven como BigInt.** Si eso sale del repositorio,
  `JSON.stringify` revienta. Se normalizan ahí mismo.

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
