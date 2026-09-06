/**
 * Datos de muestra (§13). Sin esto la demo no impresiona: un catálogo de cinco
 * productos y tres ventas no deja ver ni el buscador, ni el ranking, ni una
 * diferencia de caja.
 *
 * Todo sale de una semilla fija: dos corridas dan exactamente lo mismo.
 *
 *   npm run bd:sembrar
 */

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient, type Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { crearAleatorio, type Aleatorio } from './aleatorio';
import { CATEGORIAS, CLIENTES, PROVEEDORES, type PlantillaCategoria } from './datos-catalogo';

const SEMILLA = 20260906;
const TOTAL_PRODUCTOS = 400;
const TOTAL_VENTAS = 1500;
const DIAS_DE_HISTORIA = 30;
const SESIONES_CON_FALTANTE = 3;
const PRODUCTOS_BAJO_MINIMO = 15;
const COSTO_BCRYPT = 11;
const MILESIMAS_POR_UNIDAD_SEED = 1000;

const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

/** Cuántos productos lleva cada categoría. Los tres de peso suman 20 (§2). */
const REPARTO_PRODUCTOS: Record<string, number> = {
  Almacén: 80,
  Bebidas: 55,
  Lácteos: 40,
  Fiambrería: 7,
  Verdulería: 7,
  Carnicería: 6,
  Panadería: 25,
  Limpieza: 45,
  Perfumería: 40,
  Golosinas: 45,
  Congelados: 25,
  Bazar: 25,
};

/** Peso de cada categoría al armar una venta: se vende más almacén que bazar. */
const PESO_EN_VENTA: Record<string, number> = {
  Almacén: 20,
  Bebidas: 18,
  Lácteos: 14,
  Fiambrería: 8,
  Verdulería: 10,
  Carnicería: 7,
  Panadería: 9,
  Limpieza: 6,
  Perfumería: 4,
  Golosinas: 12,
  Congelados: 4,
  Bazar: 2,
};

const PREFIJO_SKU: Record<string, string> = {
  Almacén: 'ALM',
  Bebidas: 'BEB',
  Lácteos: 'LAC',
  Fiambrería: 'FIA',
  Verdulería: 'VER',
  Carnicería: 'CAR',
  Panadería: 'PAN',
  Limpieza: 'LIM',
  Perfumería: 'PER',
  Golosinas: 'GOL',
  Congelados: 'CON',
  Bazar: 'BAZ',
};

/** Hora del día, de 8 a 22. Picos al mediodía y a las 19 (§13). */
const PESO_POR_HORA = [6, 9, 12, 22, 26, 14, 10, 12, 16, 24, 30, 20, 12, 7, 4];
const HORA_INICIAL = 8;

/** Domingo a sábado. Viernes y sábado mueven más. */
const PESO_POR_DIA_SEMANA = [0.55, 0.85, 0.9, 0.95, 1.05, 1.45, 1.5];

/** Cuántos ítems lleva un ticket. La mayoría son compras chicas. */
const PESO_CANTIDAD_ITEMS = [14, 22, 20, 15, 11, 8, 6, 4];

/** Cuántas unidades del mismo producto: casi siempre una. */
const PESO_CANTIDAD_UNIDADES = [72, 20, 8];

function normalizarParaBuscar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inicioDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

function conHora(dia: Date, hora: number, minuto: number, segundo = 0): Date {
  const copia = new Date(dia);
  copia.setHours(hora, minuto, segundo, 0);
  return copia;
}

/** Todas las combinaciones artículo × marca × presentación, mezcladas. */
function combinacionesDe(plantilla: PlantillaCategoria, azar: Aleatorio): string[] {
  const combinaciones: string[] = [];
  for (const articulo of plantilla.articulos) {
    for (const marca of plantilla.marcas) {
      for (const presentacion of plantilla.presentaciones) {
        combinaciones.push(
          presentacion === 'por kg' ? `${articulo} ${marca}` : `${articulo} ${marca} ${presentacion}`,
        );
      }
    }
  }
  // Mezcla de Fisher-Yates con el generador con semilla, para que el orden no
  // dependa de cómo estén escritas las listas.
  for (let i = combinaciones.length - 1; i > 0; i -= 1) {
    const j = azar.entero(0, i);
    const a = combinaciones[i] as string;
    const b = combinaciones[j] as string;
    combinaciones[i] = b;
    combinaciones[j] = a;
  }
  return combinaciones;
}

/** Código de barras de 13 dígitos con dígito verificador válido. */
function codigoBarras(numero: number): string {
  const base = `779${numero.toString().padStart(9, '0')}`;
  let suma = 0;
  for (let i = 0; i < 12; i += 1) {
    suma += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const verificador = (10 - (suma % 10)) % 10;
  return `${base}${verificador}`;
}

interface ProductoSembrado {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  unidad: 'unidad' | 'kg';
  precioVentaCentavos: number;
  precioCostoCentavos: number;
  stockMinimoMilesimas: number;
  stockInicialMilesimas: number;
}

async function limpiar(): Promise<void> {
  // Orden inverso a las dependencias: primero lo que apunta, después lo apuntado.
  await prisma.auditLog.deleteMany();
  await prisma.devolucion.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.movimientoStock.deleteMany();
  await prisma.ventaItem.deleteMany();
  await prisma.venta.deleteMany();
  await prisma.movimientoCaja.deleteMany();
  await prisma.cajaSesion.deleteMany();
  await prisma.producto.deleteMany();
  await prisma.categoria.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.contador.deleteMany();
}

async function main(): Promise<void> {
  const azar = crearAleatorio(SEMILLA);
  const hoy = inicioDelDia(new Date());

  console.log('Limpiando la base…');
  await limpiar();

  // ─── Usuarios ──────────────────────────────────────────────────────────────
  console.log('Usuarios…');
  const usuarios = await Promise.all(
    [
      { nombre: 'Admin', pin: '1234', rol: 'ADMIN' },
      { nombre: 'Supervisor', pin: '2222', rol: 'SUPERVISOR' },
      { nombre: 'Cajero', pin: '1111', rol: 'CAJERO' },
    ].map(async (usuario) =>
      prisma.usuario.create({
        data: {
          nombre: usuario.nombre,
          rol: usuario.rol,
          pinHash: await bcrypt.hash(usuario.pin, COSTO_BCRYPT),
        },
      }),
    ),
  );
  const [admin, supervisor, cajero] = usuarios;
  if (!admin || !supervisor || !cajero) throw new Error('Faltan usuarios');

  // ─── Proveedores, clientes y categorías ────────────────────────────────────
  console.log('Proveedores, clientes y categorías…');
  const proveedores = await Promise.all(
    PROVEEDORES.map((proveedor) => prisma.proveedor.create({ data: proveedor })),
  );
  await Promise.all(
    CLIENTES.map((nombre, indice) =>
      prisma.cliente.create({
        data: {
          nombre,
          telefono: `351 4${azar.entero(10, 99)}-${azar.entero(1000, 9999)}`,
          saldoCuentaCorrienteCentavos: indice % 2 === 0 ? azar.entero(0, 40) * 100_000 : 0,
        },
      }),
    ),
  );

  const categorias = new Map<string, string>();
  for (const [orden, plantilla] of CATEGORIAS.entries()) {
    const categoria = await prisma.categoria.create({
      data: { nombre: plantilla.nombre, color: plantilla.color, orden },
    });
    categorias.set(plantilla.nombre, categoria.id);
  }

  // ─── Productos ─────────────────────────────────────────────────────────────
  console.log(`Productos (${TOTAL_PRODUCTOS})…`);
  const productos: ProductoSembrado[] = [];
  let numeroBarras = 1;

  for (const plantilla of CATEGORIAS) {
    const cantidad = REPARTO_PRODUCTOS[plantilla.nombre] ?? 0;
    const nombres = combinacionesDe(plantilla, azar).slice(0, cantidad);
    if (nombres.length < cantidad) {
      throw new Error(`Faltan combinaciones para ${plantilla.nombre}`);
    }
    const categoriaId = categorias.get(plantilla.nombre);
    if (!categoriaId) throw new Error(`Falta la categoría ${plantilla.nombre}`);
    const prefijo = PREFIJO_SKU[plantilla.nombre] ?? 'GEN';
    const esPorPeso = plantilla.unidad === 'kg';

    const filas = nombres.map((nombre, indice) => {
      // Precios terminados en 50 o en 00: nadie pone $1.237,43 en una góndola.
      const bruto = azar.entero(plantilla.precio[0], plantilla.precio[1]);
      const precioVentaCentavos = Math.round(bruto / 5_000) * 5_000;
      const margen = azar.entero(plantilla.margen[0], plantilla.margen[1]);
      const precioCostoCentavos = Math.round((precioVentaCentavos * (100 - margen)) / 100);

      const stockMinimoMilesimas = esPorPeso
        ? azar.entero(2, 5) * 1000
        : azar.entero(5, 15) * 1000;
      const stockInicialMilesimas = esPorPeso
        ? azar.entero(18, 70) * 1000
        : azar.entero(30, 160) * 1000;

      // Lo que se pesa y lo que sale del horno no trae código de barras: por eso
      // existe la grilla de botones de la pantalla de venta.
      const llevaCodigo = !esPorPeso && plantilla.nombre !== 'Panadería';
      const sku = `${prefijo}-${(indice + 1).toString().padStart(4, '0')}`;

      return {
        sku,
        codigoBarras: llevaCodigo ? codigoBarras(numeroBarras++) : null,
        nombre,
        nombreBusqueda: normalizarParaBuscar(nombre),
        categoriaId,
        proveedorId: azar.de(proveedores).id,
        precioVentaCentavos,
        precioCostoCentavos,
        stockMilesimas: 0,
        stockMinimoMilesimas,
        unidad: plantilla.unidad,
        activo: true,
        _stockInicialMilesimas: stockInicialMilesimas,
      };
    });

    await prisma.producto.createMany({
      data: filas.map(({ _stockInicialMilesimas: _ignorado, ...fila }) => fila),
    });

    const creados = await prisma.producto.findMany({
      where: { categoriaId },
      select: { id: true, sku: true, nombre: true },
    });
    const porSku = new Map(creados.map((producto) => [producto.sku, producto]));

    for (const fila of filas) {
      const creado = porSku.get(fila.sku);
      if (!creado) throw new Error(`No se creó ${fila.sku}`);
      productos.push({
        id: creado.id,
        sku: fila.sku,
        nombre: fila.nombre,
        categoria: plantilla.nombre,
        unidad: plantilla.unidad,
        precioVentaCentavos: fila.precioVentaCentavos,
        precioCostoCentavos: fila.precioCostoCentavos,
        stockMinimoMilesimas: fila.stockMinimoMilesimas,
        stockInicialMilesimas: fila._stockInicialMilesimas,
      });
    }
  }

  if (productos.length !== TOTAL_PRODUCTOS) {
    throw new Error(`Se generaron ${productos.length} productos, se esperaban ${TOTAL_PRODUCTOS}`);
  }

  // ─── Stock inicial ─────────────────────────────────────────────────────────
  // El stock nunca se escribe a mano: entra por un movimiento, como todo lo demás.
  console.log('Ingreso de mercadería inicial…');
  const stockActual = new Map<string, number>();
  const fechaIngreso = conHora(
    new Date(hoy.getTime() - (DIAS_DE_HISTORIA + 1) * 86_400_000),
    8,
    0,
  );

  await prisma.movimientoStock.createMany({
    data: productos.map((producto) => {
      stockActual.set(producto.id, producto.stockInicialMilesimas);
      return {
        productoId: producto.id,
        tipo: 'ingreso',
        cantidadMilesimas: producto.stockInicialMilesimas,
        stockResultanteMilesimas: producto.stockInicialMilesimas,
        motivo: 'Carga inicial de inventario',
        usuarioId: admin.id,
        creadoEn: fechaIngreso,
      };
    }),
  });

  // ─── Sesiones de caja ──────────────────────────────────────────────────────
  console.log('Sesiones de caja…');
  interface SesionSembrada {
    id: string;
    dia: Date;
    cajaNumero: number;
    usuarioId: string;
    montoInicialCentavos: number;
    abiertaEn: Date;
    cierreEn: Date;
    ventasEfectivo: number;
    retiros: number;
    ingresos: number;
  }

  const sesiones: SesionSembrada[] = [];
  for (let atras = DIAS_DE_HISTORIA; atras >= 1; atras -= 1) {
    const dia = new Date(hoy.getTime() - atras * 86_400_000);
    const diaSemana = dia.getDay();
    // La segunda caja se abre los días de más movimiento.
    const cajas = diaSemana === 5 || diaSemana === 6 || azar.conProbabilidad(0.25) ? 2 : 1;

    for (let caja = 1; caja <= cajas; caja += 1) {
      const abiertaEn = conHora(dia, 8, azar.entero(0, 25));
      const cierreEn = conHora(dia, 21, azar.entero(30, 59));
      const sesion = await prisma.cajaSesion.create({
        data: {
          cajaNumero: caja,
          usuarioId: caja === 1 ? cajero.id : supervisor.id,
          abiertaEn,
          montoInicialCentavos: 5_000_000,
          estado: 'abierta',
        },
      });
      sesiones.push({
        id: sesion.id,
        dia,
        cajaNumero: caja,
        usuarioId: sesion.usuarioId,
        montoInicialCentavos: 5_000_000,
        abiertaEn,
        cierreEn,
        ventasEfectivo: 0,
        retiros: 0,
        ingresos: 0,
      });
    }
  }
  console.log(`  ${sesiones.length} sesiones`);

  // ─── Ventas ────────────────────────────────────────────────────────────────
  console.log(`Ventas (${TOTAL_VENTAS})…`);

  // Reparto de las ventas por día, proporcional al peso del día de la semana.
  const dias = Array.from({ length: DIAS_DE_HISTORIA }, (_, indice) => {
    const dia = new Date(hoy.getTime() - (DIAS_DE_HISTORIA - indice) * 86_400_000);
    return { dia, peso: PESO_POR_DIA_SEMANA[dia.getDay()] ?? 1 };
  });
  const pesoTotal = dias.reduce((suma, entrada) => suma + entrada.peso, 0);
  const ventasPorDia = dias.map((entrada) =>
    Math.floor((entrada.peso / pesoTotal) * TOTAL_VENTAS),
  );
  // El redondeo deja algunas ventas sin asignar: se reparten en los días más fuertes.
  let restantes = TOTAL_VENTAS - ventasPorDia.reduce((suma, valor) => suma + valor, 0);
  const ordenPorPeso = dias
    .map((entrada, indice) => ({ indice, peso: entrada.peso }))
    .sort((a, b) => b.peso - a.peso);
  let cursor = 0;
  while (restantes > 0) {
    const destino = ordenPorPeso[cursor % ordenPorPeso.length];
    if (destino) {
      ventasPorDia[destino.indice] = (ventasPorDia[destino.indice] ?? 0) + 1;
      restantes -= 1;
    }
    cursor += 1;
  }

  const catalogoPorCategoria = new Map<string, ProductoSembrado[]>();
  for (const producto of productos) {
    const lista = catalogoPorCategoria.get(producto.categoria) ?? [];
    lista.push(producto);
    catalogoPorCategoria.set(producto.categoria, lista);
  }
  const nombresCategoria = CATEGORIAS.map((categoria) => categoria.nombre);
  const pesosCategoria = nombresCategoria.map((nombre) => PESO_EN_VENTA[nombre] ?? 1);

  const filasVenta: Prisma.VentaCreateManyInput[] = [];
  const filasItem: Prisma.VentaItemCreateManyInput[] = [];
  const filasPago: Prisma.PagoCreateManyInput[] = [];
  const filasMovStock: Prisma.MovimientoStockCreateManyInput[] = [];
  const filasMovCaja: Prisma.MovimientoCajaCreateManyInput[] = [];

  let numeroVenta = 0;
  const idsVenta: string[] = [];

  for (const [indiceDia, entrada] of dias.entries()) {
    const sesionesDelDia = sesiones.filter(
      (sesion) => sesion.dia.getTime() === entrada.dia.getTime(),
    );
    if (sesionesDelDia.length === 0) continue;

    const cantidadDelDia = ventasPorDia[indiceDia] ?? 0;
    for (let n = 0; n < cantidadDelDia; n += 1) {
      const sesion = azar.de(sesionesDelDia);
      const hora = HORA_INICIAL + azar.porPeso(PESO_POR_HORA);
      const creadoEn = conHora(entrada.dia, hora, azar.entero(0, 59), azar.entero(0, 59));

      // ── Ítems ──
      const cantidadItems = 1 + azar.porPeso(PESO_CANTIDAD_ITEMS);
      const elegidos = new Map<string, ProductoSembrado>();
      while (elegidos.size < cantidadItems) {
        const categoria = nombresCategoria[azar.porPeso(pesosCategoria)];
        const lista = categoria ? catalogoPorCategoria.get(categoria) : undefined;
        if (!lista || lista.length === 0) continue;
        const producto = azar.de(lista);
        elegidos.set(producto.id, producto);
      }

      numeroVenta += 1;
      const ventaId = `venta_${numeroVenta.toString().padStart(6, '0')}`;
      idsVenta.push(ventaId);

      let subtotal = 0;
      for (const producto of elegidos.values()) {
        const cantidadMilesimas =
          producto.unidad === 'kg'
            ? azar.entero(1, 12) * 100 + azar.entero(0, 99) // 0,100 a 1,299 kg
            : (1 + azar.porPeso(PESO_CANTIDAD_UNIDADES)) * 1000;

        const subtotalItem = Math.round(
          (producto.precioVentaCentavos * cantidadMilesimas) / 1000,
        );
        subtotal += subtotalItem;

        filasItem.push({
          ventaId,
          productoId: producto.id,
          nombreSnapshot: producto.nombre,
          skuSnapshot: producto.sku,
          unidadSnapshot: producto.unidad,
          precioUnitarioCentavos: producto.precioVentaCentavos,
          cantidadMilesimas,
          subtotalCentavos: subtotalItem,
        });

        const stockPrevio = stockActual.get(producto.id) ?? 0;
        const stockNuevo = stockPrevio - cantidadMilesimas;
        stockActual.set(producto.id, stockNuevo);
        filasMovStock.push({
          productoId: producto.id,
          tipo: 'venta',
          cantidadMilesimas: -cantidadMilesimas,
          stockResultanteMilesimas: stockNuevo,
          usuarioId: sesion.usuarioId,
          ventaId,
          creadoEn,
        });
      }

      // ── Descuento manual, poco frecuente ──
      const descuento = azar.conProbabilidad(0.02)
        ? Math.round((subtotal * azar.entero(5, 15)) / 100)
        : 0;
      const total = subtotal - descuento;

      // ── Pagos ──
      const pagos: { metodo: string; montoCentavos: number; vueltoCentavos: number }[] = [];
      if (azar.conProbabilidad(0.03) && total > 100_000) {
        // Pago mixto: una parte con tarjeta y el resto en efectivo.
        const parteTarjeta = Math.round(total / 2 / 10_000) * 10_000;
        const parteEfectivo = total - parteTarjeta;
        const entregado = Math.ceil(parteEfectivo / 100_000) * 100_000;
        pagos.push({ metodo: 'debito', montoCentavos: parteTarjeta, vueltoCentavos: 0 });
        pagos.push({
          metodo: 'efectivo',
          montoCentavos: entregado,
          vueltoCentavos: entregado - parteEfectivo,
        });
      } else {
        const metodo = ['efectivo', 'debito', 'credito', 'qr'][azar.porPeso([55, 25, 12, 8])] ?? 'efectivo';
        if (metodo === 'efectivo') {
          const entregado = Math.ceil(total / 100_000) * 100_000;
          pagos.push({
            metodo,
            montoCentavos: entregado,
            vueltoCentavos: entregado - total,
          });
        } else {
          pagos.push({ metodo, montoCentavos: total, vueltoCentavos: 0 });
        }
      }

      let efectivoNeto = 0;
      for (const pago of pagos) {
        filasPago.push({ ventaId, ...pago });
        if (pago.metodo === 'efectivo') efectivoNeto += pago.montoCentavos - pago.vueltoCentavos;
      }

      filasVenta.push({
        id: ventaId,
        numero: numeroVenta,
        claveIdempotencia: `seed-${ventaId}`,
        cajaSesionId: sesion.id,
        usuarioId: sesion.usuarioId,
        subtotalCentavos: subtotal,
        descuentoCentavos: descuento,
        totalCentavos: total,
        estado: 'completada',
        creadoEn,
      });

      if (efectivoNeto !== 0) {
        sesion.ventasEfectivo += efectivoNeto;
        filasMovCaja.push({
          cajaSesionId: sesion.id,
          tipo: 'venta',
          montoCentavos: efectivoNeto,
          usuarioId: sesion.usuarioId,
          creadoEn,
        });
      }
    }
  }

  console.log(`  ${filasVenta.length} ventas, ${filasItem.length} ítems`);

  const enTandas = async <T>(filas: T[], guardar: (tanda: T[]) => Promise<unknown>) => {
    const TAMANO = 500;
    for (let inicio = 0; inicio < filas.length; inicio += TAMANO) {
      await guardar(filas.slice(inicio, inicio + TAMANO));
    }
  };

  await enTandas(filasVenta, (tanda) => prisma.venta.createMany({ data: tanda }));
  await enTandas(filasItem, (tanda) => prisma.ventaItem.createMany({ data: tanda }));
  await enTandas(filasPago, (tanda) => prisma.pago.createMany({ data: tanda }));
  await enTandas(filasMovStock, (tanda) => prisma.movimientoStock.createMany({ data: tanda }));

  // ─── Retiros de caja ───────────────────────────────────────────────────────
  // Cuando se junta mucho efectivo, el encargado retira y lo lleva a la caja fuerte.
  for (const sesion of sesiones) {
    if (sesion.ventasEfectivo > 15_000_000 && azar.conProbabilidad(0.5)) {
      const monto = Math.round(sesion.ventasEfectivo / 2 / 100_000) * 100_000;
      sesion.retiros += monto;
      filasMovCaja.push({
        cajaSesionId: sesion.id,
        tipo: 'retiro',
        montoCentavos: monto,
        motivo: 'Retiro a caja fuerte',
        usuarioId: supervisor.id,
        creadoEn: conHora(sesion.dia, 17, azar.entero(0, 59)),
      });
    }
  }
  await enTandas(filasMovCaja, (tanda) => prisma.movimientoCaja.createMany({ data: tanda }));

  // ─── Cierre de las sesiones ────────────────────────────────────────────────
  console.log('Cerrando las sesiones de caja…');
  // Las tres con faltante se eligen por índice y no al azar, para que la demo
  // siempre las tenga y siempre en el mismo lugar.
  const conFaltante = new Set(
    Array.from({ length: SESIONES_CON_FALTANTE }, (_, indice) =>
      Math.floor((sesiones.length / (SESIONES_CON_FALTANTE + 1)) * (indice + 1)),
    ),
  );

  for (const [indice, sesion] of sesiones.entries()) {
    const esperado =
      sesion.montoInicialCentavos + sesion.ventasEfectivo + sesion.ingresos - sesion.retiros;

    let declarado = esperado;
    if (conFaltante.has(indice)) {
      declarado = esperado - azar.entero(15, 90) * 10_000;
    } else if (azar.conProbabilidad(0.12)) {
      // Sobrantes chicos de vuelto mal dado. Son a favor a propósito: los
      // faltantes tienen que ser exactamente los tres del guion de demo, sin
      // ruido alrededor que obligue a explicar cuál es cuál.
      declarado = esperado + azar.entero(1, 5) * 10_000;
    }

    await prisma.cajaSesion.update({
      where: { id: sesion.id },
      data: {
        estado: 'cerrada',
        cerradaEn: sesion.cierreEn,
        montoEsperadoCentavos: esperado,
        montoDeclaradoCentavos: declarado,
        diferenciaCentavos: declarado - esperado,
      },
    });

    if (declarado !== esperado) {
      await prisma.auditLog.create({
        data: {
          usuarioId: sesion.usuarioId,
          accion: 'cierre_caja_con_diferencia',
          entidad: 'CajaSesion',
          entidadId: sesion.id,
          datosAntes: JSON.stringify({ esperadoCentavos: esperado }),
          datosDespues: JSON.stringify({
            declaradoCentavos: declarado,
            diferenciaCentavos: declarado - esperado,
          }),
          creadoEn: sesion.cierreEn,
        },
      });
    }
  }

  // ─── Reposición ────────────────────────────────────────────────────────────
  // Treinta días de ventas dejan medio catálogo por debajo del mínimo, y una
  // alerta con cien filas no la mira nadie. El comercio repone: acá se repone
  // igual, con un movimiento de ingreso, para que la alerta quede en los 15
  // que pide el §13 y no en un número que se explica solo por el seed.
  console.log('Reposición de mercadería…');
  const filasReposicion: Prisma.MovimientoStockCreateManyInput[] = [];
  const fechaReposicion = conHora(new Date(hoy.getTime() - 2 * 86_400_000), 9, 0);

  for (const producto of productos) {
    const actual = stockActual.get(producto.id) ?? 0;
    if (actual >= producto.stockMinimoMilesimas * 2) continue;
    const objetivo = producto.stockInicialMilesimas;
    const ingreso = objetivo - actual;
    if (ingreso <= 0) continue;
    stockActual.set(producto.id, objetivo);
    filasReposicion.push({
      productoId: producto.id,
      tipo: 'ingreso',
      cantidadMilesimas: ingreso,
      stockResultanteMilesimas: objetivo,
      motivo: 'Reposición de proveedor',
      usuarioId: admin.id,
      creadoEn: fechaReposicion,
    });
  }
  await enTandas(filasReposicion, (tanda) => prisma.movimientoStock.createMany({ data: tanda }));
  console.log(`  ${filasReposicion.length} productos repuestos`);

  // ─── Productos bajo el mínimo ──────────────────────────────────────────────
  // Se baja el stock con una merma, no editando el número: si el stock se
  // pudiera escribir a mano, el ledger dejaría de cuadrar y la regla del §4
  // sería mentira.
  console.log(`Dejando ${PRODUCTOS_BAJO_MINIMO} productos bajo el mínimo…`);
  const candidatos = productos
    .filter((producto) => (stockActual.get(producto.id) ?? 0) > producto.stockMinimoMilesimas)
    .slice(0, PRODUCTOS_BAJO_MINIMO);

  for (const producto of candidatos) {
    const actual = stockActual.get(producto.id) ?? 0;
    // Lo que se cuenta queda en unidades enteras: un producto por unidad no
    // puede tener 5,6 unidades en la góndola, y en la alerta se leía "5,6 u".
    const crudo = producto.stockMinimoMilesimas * 0.4;
    const objetivo = Math.max(
      0,
      producto.unidad === 'kg'
        ? Math.round(crudo)
        : Math.floor(crudo / MILESIMAS_POR_UNIDAD_SEED) * MILESIMAS_POR_UNIDAD_SEED,
    );
    const baja = actual - objetivo;
    if (baja <= 0) continue;
    stockActual.set(producto.id, objetivo);
    await prisma.movimientoStock.create({
      data: {
        productoId: producto.id,
        tipo: 'merma',
        cantidadMilesimas: -baja,
        stockResultanteMilesimas: objetivo,
        motivo: 'Rotura y vencimiento',
        usuarioId: supervisor.id,
        creadoEn: conHora(new Date(hoy.getTime() - 86_400_000), 19, 30),
      },
    });
  }

  // ─── Cache de stock ────────────────────────────────────────────────────────
  console.log('Actualizando el stock de cada producto…');
  for (const producto of productos) {
    await prisma.producto.update({
      where: { id: producto.id },
      data: { stockMilesimas: stockActual.get(producto.id) ?? 0 },
    });
  }

  await prisma.contador.create({ data: { nombre: 'venta', valor: numeroVenta } });

  // ─── Resumen ───────────────────────────────────────────────────────────────
  const bajoMinimo = productos.filter(
    (producto) => (stockActual.get(producto.id) ?? 0) < producto.stockMinimoMilesimas,
  ).length;
  const totalVendido = filasVenta.reduce((suma, venta) => suma + venta.totalCentavos, 0);
  const conDiferencia = await prisma.cajaSesion.count({
    where: { diferenciaCentavos: { not: 0 } },
  });
  const faltantes = await prisma.cajaSesion.count({ where: { diferenciaCentavos: { lt: 0 } } });

  console.log('');
  console.log('Listo.');
  console.log(`  productos            ${productos.length} (${productos.filter((p) => p.unidad === 'kg').length} por peso)`);
  console.log(`  bajo el mínimo       ${bajoMinimo}`);
  console.log(`  ventas               ${filasVenta.length}`);
  console.log(`  ítems vendidos       ${filasItem.length}`);
  console.log(`  ticket promedio      $${Math.round(totalVendido / filasVenta.length / 100).toLocaleString('es-AR')}`);
  console.log(`  sesiones de caja     ${sesiones.length} (${conDiferencia} con diferencia, ${faltantes} con faltante)`);
  console.log('');
  console.log('  PIN: Admin 1234 · Supervisor 2222 · Cajero 1111');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
