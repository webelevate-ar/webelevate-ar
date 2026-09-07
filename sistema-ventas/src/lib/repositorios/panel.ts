import { multiplicarPorCantidad } from '../dinero';
import { prisma } from '../prisma';

/**
 * Consultas del panel.
 *
 * ⚠️ Antes esto era SQL crudo con `date(creado_en, 'localtime')` y `strftime`.
 * Andaba en SQLite y **fallaba entero en PostgreSQL**: `function date(timestamp
 * without time zone, unknown) does not exist`. Se descubrió corriendo la
 * aplicación contra un PostgreSQL de verdad, no leyendo el código.
 *
 * Ahora agrupa en JavaScript sobre las filas del período. Tres razones, en
 * orden de importancia:
 *
 *  1. **Es igual en los dos motores.** No hay dialecto que mantener por
 *     duplicado ni una rama que solo se prueba en uno de los dos.
 *  2. **El margen se calcula con `multiplicarPorCantidad`**, la misma función
 *     que usa la venta y que tiene tests al 100 %. En SQL era
 *     `costo * cantidad / 1000`, una división entera que trunca: el margen del
 *     panel no coincidía exactamente con el de la venta.
 *  3. Se acabó el problema de los BigInt: la API tipada devuelve números.
 *
 * El costo es traer las filas del período —unas 1.500 ventas y 5.000 ítems por
 * mes en un autoservicio— en vez de agregar en la base. Para este tamaño no se
 * nota, y el panel no es la pantalla que tiene que ser rápida: esa es la venta.
 */

interface FilaDeVenta {
  creadoEn: Date;
  totalCentavos: number;
}

function ventasDelPeriodo(desde: Date, hasta?: Date): Promise<FilaDeVenta[]> {
  return prisma.venta.findMany({
    where: {
      estado: 'completada',
      creadoEn: { gte: desde, ...(hasta ? { lt: hasta } : {}) },
    },
    select: { creadoEn: true, totalCentavos: true },
    orderBy: { creadoEn: 'asc' },
  });
}

/** "2026-09-06" en hora local. La zona la fija el `TZ` del servidor. */
function claveDelDia(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export interface TotalDelDia {
  dia: string;
  ventas: number;
  totalCentavos: number;
}

export interface VentaPorHora {
  hora: number;
  ventas: number;
  totalCentavos: number;
}

/**
 * Los dos gráficos salen de la misma lectura. Pedir las mismas 1.500 filas dos
 * veces para agrupar una por día y otra por hora sería pagar dos veces lo mismo.
 */
export async function totalesPorDiaYHora(
  desde: Date,
): Promise<{ porDia: TotalDelDia[]; porHora: VentaPorHora[] }> {
  const filas = await ventasDelPeriodo(desde);

  const dias = new Map<string, TotalDelDia>();
  const horas = new Map<number, VentaPorHora>();

  for (const fila of filas) {
    const dia = claveDelDia(fila.creadoEn);
    const acumuladoDia = dias.get(dia) ?? { dia, ventas: 0, totalCentavos: 0 };
    acumuladoDia.ventas += 1;
    acumuladoDia.totalCentavos += fila.totalCentavos;
    dias.set(dia, acumuladoDia);

    const hora = fila.creadoEn.getHours();
    const acumuladoHora = horas.get(hora) ?? { hora, ventas: 0, totalCentavos: 0 };
    acumuladoHora.ventas += 1;
    acumuladoHora.totalCentavos += fila.totalCentavos;
    horas.set(hora, acumuladoHora);
  }

  return {
    porDia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    porHora: [...horas.values()].sort((a, b) => a.hora - b.hora),
  };
}

export interface ProductoDelRanking {
  productoId: string;
  nombre: string;
  unidad: string;
  cantidadMilesimas: number;
  totalCentavos: number;
  margenCentavos: number;
}

export async function rankingProductos(desde: Date, limite = 10): Promise<ProductoDelRanking[]> {
  const agrupado = await prisma.ventaItem.groupBy({
    by: ['productoId'],
    where: { venta: { estado: 'completada', creadoEn: { gte: desde } } },
    _sum: { subtotalCentavos: true, cantidadMilesimas: true },
    orderBy: { _sum: { subtotalCentavos: 'desc' } },
    take: limite,
  });

  const productos = await prisma.producto.findMany({
    where: { id: { in: agrupado.map((fila) => fila.productoId) } },
    select: { id: true, nombre: true, unidad: true, precioCostoCentavos: true },
  });
  const porId = new Map(productos.map((producto) => [producto.id, producto]));

  return agrupado.map((fila) => {
    const producto = porId.get(fila.productoId);
    const cantidadMilesimas = fila._sum.cantidadMilesimas ?? 0;
    const totalCentavos = fila._sum.subtotalCentavos ?? 0;
    const costo = producto
      ? multiplicarPorCantidad(producto.precioCostoCentavos, cantidadMilesimas)
      : 0;

    return {
      productoId: fila.productoId,
      nombre: producto?.nombre ?? 'Producto dado de baja',
      unidad: producto?.unidad ?? 'unidad',
      cantidadMilesimas,
      totalCentavos,
      margenCentavos: totalCentavos - costo,
    };
  });
}

export interface ResumenDeVentas {
  ventas: number;
  totalCentavos: number;
  itemsVendidos: number;
}

export async function resumenEntre(desde: Date, hasta: Date): Promise<ResumenDeVentas> {
  const [cabecera, itemsVendidos] = await Promise.all([
    prisma.venta.aggregate({
      where: { estado: 'completada', creadoEn: { gte: desde, lt: hasta } },
      _count: { _all: true },
      _sum: { totalCentavos: true },
    }),
    prisma.ventaItem.count({
      where: { venta: { estado: 'completada', creadoEn: { gte: desde, lt: hasta } } },
    }),
  ]);

  return {
    ventas: cabecera._count._all,
    totalCentavos: cabecera._sum.totalCentavos ?? 0,
    itemsVendidos,
  };
}

export interface TotalPorMetodo {
  metodo: string;
  totalCentavos: number;
  cantidad: number;
}

export async function totalesPorMetodo(desde: Date): Promise<TotalPorMetodo[]> {
  const agrupado = await prisma.pago.groupBy({
    by: ['metodo'],
    where: { venta: { estado: 'completada', creadoEn: { gte: desde } } },
    _sum: { montoCentavos: true, vueltoCentavos: true },
    _count: { _all: true },
  });

  return agrupado
    .map((fila) => ({
      metodo: fila.metodo,
      // Neto de vuelto: lo entregado menos lo devuelto es lo que cobró el local.
      totalCentavos: (fila._sum.montoCentavos ?? 0) - (fila._sum.vueltoCentavos ?? 0),
      cantidad: fila._count._all,
    }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos);
}

export interface MargenTotal {
  ventaCentavos: number;
  costoCentavos: number;
}

export async function margenEntre(desde: Date, hasta: Date): Promise<MargenTotal> {
  const agrupado = await prisma.ventaItem.groupBy({
    by: ['productoId'],
    where: { venta: { estado: 'completada', creadoEn: { gte: desde, lt: hasta } } },
    _sum: { subtotalCentavos: true, cantidadMilesimas: true },
  });

  if (agrupado.length === 0) return { ventaCentavos: 0, costoCentavos: 0 };

  const productos = await prisma.producto.findMany({
    where: { id: { in: agrupado.map((fila) => fila.productoId) } },
    select: { id: true, precioCostoCentavos: true },
  });
  const costoPorId = new Map(productos.map((p) => [p.id, p.precioCostoCentavos]));

  let ventaCentavos = 0;
  let costoCentavos = 0;
  for (const fila of agrupado) {
    ventaCentavos += fila._sum.subtotalCentavos ?? 0;
    const costoUnitario = costoPorId.get(fila.productoId);
    if (costoUnitario !== undefined) {
      costoCentavos += multiplicarPorCantidad(costoUnitario, fila._sum.cantidadMilesimas ?? 0);
    }
  }

  return { ventaCentavos, costoCentavos };
}
