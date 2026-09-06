import { prisma } from '../prisma';

/**
 * Consultas del panel. Van en SQL crudo a propósito: son agregaciones sobre
 * decenas de miles de filas y el `groupBy` de Prisma obligaría a traérselas
 * todas para sumar en JavaScript.
 *
 * ⚠️ SQLite devuelve `SUM()` y `COUNT()` como BigInt. Si eso sale de acá tal
 * cual, `Math.round` lanza "Cannot convert a BigInt value to a number" y
 * `JSON.stringify` lanza "Do not know how to serialize a BigInt": el panel
 * entero devuelve 500. Pasó, y no lo encontró ningún test —la pantalla mostraba
 * su estado de error, que es lo que tiene que hacer— sino leer el log del
 * servidor. Por eso toda fila que sale de este archivo pasa por `aNumero`.
 */

/*
 * ⚠️ Segunda trampa de este archivo: Prisma con el adaptador de SQLite guarda
 * las fechas como TEXTO ISO ("2026-08-07T08:23:21.000+00:00"), no como
 * milisegundos. La versión anterior hacía `date(creado_en / 1000, 'unixepoch')`
 * —que sería lo correcto si fueran números— y SQLite devolvía 1970-01-01 para
 * las 1.500 ventas: el gráfico mostraba una sola barra gigante en vez de
 * treinta. No falló nada, no hubo error: simplemente el dato estaba mal, y se
 * vio mirando la pantalla. Las funciones de fecha van sobre la columna tal cual,
 * con el modificador 'localtime'.
 */

function aNumero(valor: unknown): number {
  if (typeof valor === 'bigint') return Number(valor);
  if (typeof valor === 'number') return valor;
  return Number(valor ?? 0);
}

export interface TotalDelDia {
  dia: string;
  ventas: number;
  totalCentavos: number;
}

export async function totalesPorDia(desde: Date): Promise<TotalDelDia[]> {
  const filas = await prisma.$queryRaw<TotalDelDia[]>`
    SELECT date(creado_en, 'localtime')                     AS dia,
           COUNT(*)                                        AS ventas,
           COALESCE(SUM(total_centavos), 0)                AS totalCentavos
    FROM venta
    WHERE estado = 'completada' AND creado_en >= ${desde}
    GROUP BY dia
    ORDER BY dia ASC
  `;
  return filas.map((fila) => ({
    dia: String(fila.dia),
    ventas: aNumero(fila.ventas),
    totalCentavos: aNumero(fila.totalCentavos),
  }));
}

export interface VentaPorHora {
  hora: number;
  ventas: number;
  totalCentavos: number;
}

export async function ventasPorHora(desde: Date): Promise<VentaPorHora[]> {
  const filas = await prisma.$queryRaw<VentaPorHora[]>`
    SELECT CAST(strftime('%H', creado_en, 'localtime') AS INTEGER)                    AS hora,
           COUNT(*)                                                                   AS ventas,
           COALESCE(SUM(total_centavos), 0)                                           AS totalCentavos
    FROM venta
    WHERE estado = 'completada' AND creado_en >= ${desde}
    GROUP BY hora
    ORDER BY hora ASC
  `;
  return filas.map((fila) => ({
    hora: aNumero(fila.hora),
    ventas: aNumero(fila.ventas),
    totalCentavos: aNumero(fila.totalCentavos),
  }));
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
  const filas = await prisma.$queryRaw<ProductoDelRanking[]>`
    SELECT vi.producto_id                                                       AS productoId,
           vi.nombre_snapshot                                                   AS nombre,
           vi.unidad_snapshot                                                   AS unidad,
           SUM(vi.cantidad_milesimas)                                           AS cantidadMilesimas,
           SUM(vi.subtotal_centavos)                                            AS totalCentavos,
           SUM(vi.subtotal_centavos - (p.precio_costo_centavos * vi.cantidad_milesimas / 1000)) AS margenCentavos
    FROM venta_item vi
    JOIN venta v    ON v.id = vi.venta_id
    JOIN producto p ON p.id = vi.producto_id
    WHERE v.estado = 'completada' AND v.creado_en >= ${desde}
    GROUP BY vi.producto_id, vi.nombre_snapshot, vi.unidad_snapshot
    ORDER BY totalCentavos DESC
    LIMIT ${limite}
  `;
  return filas.map((fila) => ({
    productoId: String(fila.productoId),
    nombre: String(fila.nombre),
    unidad: String(fila.unidad),
    cantidadMilesimas: aNumero(fila.cantidadMilesimas),
    totalCentavos: aNumero(fila.totalCentavos),
    margenCentavos: Math.round(aNumero(fila.margenCentavos)),
  }));
}

export interface ResumenDeVentas {
  ventas: number;
  totalCentavos: number;
  itemsVendidos: number;
}

/**
 * Van en dos consultas y no en una con JOIN: unir venta con venta_item
 * multiplica el total de la venta por la cantidad de ítems, y el resumen
 * saldría inflado sin que nada avise.
 */
export async function resumenEntre(desde: Date, hasta: Date): Promise<ResumenDeVentas> {
  const [cabecera, detalle] = await Promise.all([
    prisma.$queryRaw<{ ventas: number; totalCentavos: number }[]>`
      SELECT COUNT(*)                             AS ventas,
             COALESCE(SUM(total_centavos), 0)     AS totalCentavos
      FROM venta
      WHERE estado = 'completada' AND creado_en >= ${desde} AND creado_en < ${hasta}
    `,
    prisma.$queryRaw<{ itemsVendidos: number }[]>`
      SELECT COUNT(*) AS itemsVendidos
      FROM venta_item vi
      JOIN venta v ON v.id = vi.venta_id
      WHERE v.estado = 'completada' AND v.creado_en >= ${desde} AND v.creado_en < ${hasta}
    `,
  ]);

  return {
    ventas: aNumero(cabecera[0]?.ventas),
    totalCentavos: aNumero(cabecera[0]?.totalCentavos),
    itemsVendidos: aNumero(detalle[0]?.itemsVendidos),
  };
}

export interface TotalPorMetodo {
  metodo: string;
  totalCentavos: number;
  cantidad: number;
}

export async function totalesPorMetodo(desde: Date): Promise<TotalPorMetodo[]> {
  const filas = await prisma.$queryRaw<TotalPorMetodo[]>`
    SELECT pa.metodo                          AS metodo,
           SUM(pa.monto_centavos - pa.vuelto_centavos) AS totalCentavos,
           COUNT(*)                           AS cantidad
    FROM pago pa
    JOIN venta v ON v.id = pa.venta_id
    WHERE v.estado = 'completada' AND v.creado_en >= ${desde}
    GROUP BY pa.metodo
    ORDER BY totalCentavos DESC
  `;
  return filas.map((fila) => ({
    metodo: String(fila.metodo),
    totalCentavos: aNumero(fila.totalCentavos),
    cantidad: aNumero(fila.cantidad),
  }));
}

export interface MargenTotal {
  ventaCentavos: number;
  costoCentavos: number;
}

export async function margenEntre(desde: Date, hasta: Date): Promise<MargenTotal> {
  const filas = await prisma.$queryRaw<MargenTotal[]>`
    SELECT COALESCE(SUM(vi.subtotal_centavos), 0)                                     AS ventaCentavos,
           COALESCE(SUM(p.precio_costo_centavos * vi.cantidad_milesimas / 1000), 0)   AS costoCentavos
    FROM venta_item vi
    JOIN venta v    ON v.id = vi.venta_id
    JOIN producto p ON p.id = vi.producto_id
    WHERE v.estado = 'completada' AND v.creado_en >= ${desde} AND v.creado_en < ${hasta}
  `;
  return {
    ventaCentavos: Math.round(aNumero(filas[0]?.ventaCentavos)),
    costoCentavos: Math.round(aNumero(filas[0]?.costoCentavos)),
  };
}
