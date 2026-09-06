import { prisma } from '../prisma';

/** Repositorio de movimientos de stock. */

export function listarMovimientos(opciones: { productoId?: string; limite?: number } = {}) {
  return prisma.movimientoStock.findMany({
    where: opciones.productoId ? { productoId: opciones.productoId } : {},
    orderBy: { creadoEn: 'desc' },
    take: opciones.limite ?? 100,
    include: {
      producto: { select: { nombre: true, sku: true, unidad: true } },
      usuario: { select: { nombre: true } },
    },
  });
}

/**
 * Registra un movimiento y mueve el cache del producto en la misma
 * transacción: si se hicieran por separado, un corte entre las dos escrituras
 * dejaría el stock desviado del ledger.
 */
export function registrarMovimiento(datos: {
  productoId: string;
  tipo: string;
  cantidadMilesimas: number;
  motivo: string;
  usuarioId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.update({
      where: { id: datos.productoId },
      data: { stockMilesimas: { increment: datos.cantidadMilesimas } },
      select: { id: true, nombre: true, stockMilesimas: true },
    });

    const movimiento = await tx.movimientoStock.create({
      data: {
        productoId: datos.productoId,
        tipo: datos.tipo,
        cantidadMilesimas: datos.cantidadMilesimas,
        stockResultanteMilesimas: producto.stockMilesimas,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
    });

    return { movimiento, producto };
  });
}
