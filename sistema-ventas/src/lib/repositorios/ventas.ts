import type { Prisma } from '@prisma/client';
import { esPostgres, SECUENCIA_VENTA } from '../motor';
import type { ClientePrisma } from '../prisma';
import { conReintentos } from '../reintentos';
import { prisma } from '../prisma';

/**
 * Repositorio de ventas. Acá vive la transacción que crea una venta entera.
 */

export const VENTA_COMPLETA = {
  items: true,
  pagos: true,
  usuario: { select: { nombre: true, rol: true } },
  cajaSesion: { select: { cajaNumero: true } },
  cliente: { select: { nombre: true } },
} satisfies Prisma.VentaInclude;

export type VentaCompleta = Prisma.VentaGetPayload<{ include: typeof VENTA_COMPLETA }>;

export function buscarPorClaveIdempotencia(clave: string): Promise<VentaCompleta | null> {
  return prisma.venta.findUnique({
    where: { claveIdempotencia: clave },
    include: VENTA_COMPLETA,
  });
}

export function buscarPorId(id: string): Promise<VentaCompleta | null> {
  return prisma.venta.findUnique({ where: { id }, include: VENTA_COMPLETA });
}

export function buscarPorNumero(numero: number): Promise<VentaCompleta | null> {
  return prisma.venta.findUnique({ where: { numero }, include: VENTA_COMPLETA });
}

/**
 * Siguiente número de venta. `count() + 1` repite números en cuanto dos cajas
 * cobran a la vez (§8.3), así que va contra la base.
 *
 * ⚠️ Los dos motores lo resuelven distinto, y no por gusto:
 *
 * **PostgreSQL: una secuencia.** Es lo que pedía el plan y es lo único que
 * escala. La fila de un contador, actualizada dentro de una transacción
 * `Serializable`, es un punto caliente garantizado: todas las ventas tocan la
 * misma fila y PostgreSQL las aborta entre sí. Con dos cajas el reintento
 * alcanza; con veinte ventas simultáneas se agotan los reintentos y la venta
 * falla. Medido, no supuesto. `nextval` no participa de la transacción y por
 * eso no genera conflicto.
 *
 * El precio de la secuencia es que **puede dejar huecos** si una transacción
 * se anula: la venta 41 puede seguir a la 39. Es el comportamiento correcto y
 * es lo que hace cualquier sistema de numeración: lo que no puede pasar nunca
 * es que dos ventas compartan número, y eso la secuencia lo garantiza.
 *
 * **SQLite: la fila del contador.** No tiene secuencias, y tampoco tiene el
 * problema: escribe de a una transacción por vez.
 */
export async function siguienteNumeroVenta(cliente: ClientePrisma): Promise<number> {
  if (esPostgres) {
    const filas = await cliente.$queryRawUnsafe<{ valor: number | bigint }[]>(
      `SELECT nextval('${SECUENCIA_VENTA}') AS valor`,
    );
    const valor = filas[0]?.valor;
    if (valor === undefined) throw new Error('La secuencia de ventas no devolvió un número.');
    return Number(valor);
  }

  const filas = await cliente.$queryRaw<{ valor: number }[]>`
    UPDATE contador SET valor = valor + 1 WHERE nombre = 'venta' RETURNING valor
  `;
  const fila = filas[0];
  if (!fila) throw new Error('Falta la fila del contador de ventas. ¿Corriste el seed?');
  return fila.valor;
}

export interface ItemAPersistir {
  productoId: string;
  nombreSnapshot: string;
  skuSnapshot: string;
  unidadSnapshot: string;
  precioUnitarioCentavos: number;
  cantidadMilesimas: number;
  subtotalCentavos: number;
}

export interface PagoAPersistir {
  metodo: string;
  montoCentavos: number;
  vueltoCentavos: number;
}

export interface VentaAPersistir {
  claveIdempotencia: string;
  cajaSesionId: string;
  usuarioId: string;
  clienteId: string | null;
  subtotalCentavos: number;
  descuentoCentavos: number;
  totalCentavos: number;
  items: ItemAPersistir[];
  pagos: PagoAPersistir[];
  efectivoNetoCentavos: number;
}

/**
 * Crea la venta entera dentro de una transacción: Venta + VentaItem[] +
 * Pago[] + MovimientoStock[] + MovimientoCaja (§8.3). Si algo falla, no queda
 * media venta cobrada y sin ítems.
 *
 * El nivel `Serializable` es el único que SQLite ofrece y el que hace falta en
 * PostgreSQL para que dos cajas no lean el mismo stock antes de descontarlo.
 */
export function crearVentaCompleta(datos: VentaAPersistir): Promise<VentaCompleta> {
  // El reintento no es opcional con `Serializable`: PostgreSQL aborta una de
  // las dos transacciones que chocan y espera que se repita. Ver reintentos.ts.
  return conReintentos('la creación de la venta', () =>
    prisma.$transaction(
      async (tx) => {
        const numero = await siguienteNumeroVenta(tx);

        const venta = await tx.venta.create({
          data: {
            numero,
            claveIdempotencia: datos.claveIdempotencia,
            cajaSesionId: datos.cajaSesionId,
            usuarioId: datos.usuarioId,
            clienteId: datos.clienteId,
            subtotalCentavos: datos.subtotalCentavos,
            descuentoCentavos: datos.descuentoCentavos,
            totalCentavos: datos.totalCentavos,
            estado: 'completada',
            items: { create: datos.items },
            pagos: { create: datos.pagos },
          },
          include: VENTA_COMPLETA,
        });

        for (const item of datos.items) {
          const producto = await tx.producto.update({
            where: { id: item.productoId },
            data: { stockMilesimas: { decrement: item.cantidadMilesimas } },
            select: { stockMilesimas: true },
          });
          await tx.movimientoStock.create({
            data: {
              productoId: item.productoId,
              tipo: 'venta',
              cantidadMilesimas: -item.cantidadMilesimas,
              stockResultanteMilesimas: producto.stockMilesimas,
              usuarioId: datos.usuarioId,
              ventaId: venta.id,
            },
          });
        }

        if (datos.efectivoNetoCentavos !== 0) {
          await tx.movimientoCaja.create({
            data: {
              cajaSesionId: datos.cajaSesionId,
              tipo: 'venta',
              montoCentavos: datos.efectivoNetoCentavos,
              usuarioId: datos.usuarioId,
            },
          });
        }

        return venta;
      },
      { isolationLevel: 'Serializable' },
    ),
  );
}

/**
 * Anula una venta. No se borra nada: se marca anulada y se generan los
 * movimientos inversos de stock y de caja (§4).
 */
export function anularVenta(datos: {
  ventaId: string;
  usuarioId: string;
  motivo: string;
}): Promise<VentaCompleta> {
  return conReintentos('la anulación de la venta', () =>
    prisma.$transaction(
      async (tx) => {
        const venta = await tx.venta.findUnique({
          where: { id: datos.ventaId },
          include: { items: true, pagos: true },
        });
        if (!venta) throw new Error('La venta no existe');

        for (const item of venta.items) {
          const producto = await tx.producto.update({
            where: { id: item.productoId },
            data: { stockMilesimas: { increment: item.cantidadMilesimas } },
            select: { stockMilesimas: true },
          });
          await tx.movimientoStock.create({
            data: {
              productoId: item.productoId,
              tipo: 'devolucion',
              cantidadMilesimas: item.cantidadMilesimas,
              stockResultanteMilesimas: producto.stockMilesimas,
              motivo: `Anulación de la venta ${venta.numero}`,
              usuarioId: datos.usuarioId,
              ventaId: venta.id,
            },
          });
        }

        const efectivoNeto = venta.pagos.reduce(
          (suma, pago) =>
            pago.metodo === 'efectivo' ? suma + pago.montoCentavos - pago.vueltoCentavos : suma,
          0,
        );
        if (efectivoNeto !== 0) {
          await tx.movimientoCaja.create({
            data: {
              cajaSesionId: venta.cajaSesionId,
              tipo: 'devolucion',
              montoCentavos: efectivoNeto,
              motivo: `Anulación de la venta ${venta.numero}`,
              usuarioId: datos.usuarioId,
            },
          });
        }

        return tx.venta.update({
          where: { id: venta.id },
          data: {
            estado: 'anulada',
            anuladaEn: new Date(),
            anuladaPorId: datos.usuarioId,
            motivoAnulacion: datos.motivo,
          },
          include: VENTA_COMPLETA,
        });
      },
      { isolationLevel: 'Serializable' },
    ),
  );
}

export interface FiltroVentasRepo {
  desde: Date | null;
  hasta: Date | null;
  estado: 'completada' | 'anulada' | 'todas';
  usuarioId: string | null;
  cajaSesionId: string | null;
  numero: number | null;
  pagina: number;
  porPagina: number;
}

export async function listarPaginado(filtro: FiltroVentasRepo) {
  const donde: Prisma.VentaWhereInput = {};
  if (filtro.estado !== 'todas') donde.estado = filtro.estado;
  if (filtro.usuarioId) donde.usuarioId = filtro.usuarioId;
  if (filtro.cajaSesionId) donde.cajaSesionId = filtro.cajaSesionId;
  if (filtro.numero !== null) donde.numero = filtro.numero;
  if (filtro.desde || filtro.hasta) {
    donde.creadoEn = {
      ...(filtro.desde ? { gte: filtro.desde } : {}),
      ...(filtro.hasta ? { lte: filtro.hasta } : {}),
    };
  }

  const [total, filas] = await Promise.all([
    prisma.venta.count({ where: donde }),
    prisma.venta.findMany({
      where: donde,
      include: {
        usuario: { select: { nombre: true } },
        pagos: true,
        _count: { select: { items: true } },
      },
      orderBy: { creadoEn: 'desc' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
    }),
  ]);

  return { total, filas };
}
