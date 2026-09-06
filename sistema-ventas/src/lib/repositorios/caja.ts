import type { ClientePrisma } from '../prisma';
import { prisma } from '../prisma';

/** Repositorio de caja: sesiones, movimientos y los totales del arqueo. */

export function sesionAbiertaDeUsuario(usuarioId: string) {
  return prisma.cajaSesion.findFirst({
    where: { usuarioId, estado: 'abierta' },
    orderBy: { abiertaEn: 'desc' },
  });
}

export function sesionAbiertaDeCaja(cajaNumero: number) {
  return prisma.cajaSesion.findFirst({
    where: { cajaNumero, estado: 'abierta' },
  });
}

export function buscarSesion(id: string, cliente: ClientePrisma = prisma) {
  return cliente.cajaSesion.findUnique({ where: { id } });
}

export function abrirSesion(datos: {
  cajaNumero: number;
  usuarioId: string;
  montoInicialCentavos: number;
}) {
  return prisma.cajaSesion.create({
    data: { ...datos, estado: 'abierta' },
  });
}

export function registrarMovimiento(
  datos: {
    cajaSesionId: string;
    tipo: string;
    montoCentavos: number;
    motivo?: string | null;
    usuarioId: string;
  },
  cliente: ClientePrisma = prisma,
) {
  return cliente.movimientoCaja.create({ data: { ...datos, motivo: datos.motivo ?? null } });
}

export function listarMovimientos(cajaSesionId: string) {
  return prisma.movimientoCaja.findMany({
    where: { cajaSesionId },
    orderBy: { creadoEn: 'desc' },
    include: { usuario: { select: { nombre: true } } },
  });
}

export interface TotalesDeSesion {
  ventasEfectivoCentavos: number;
  ingresosCentavos: number;
  retirosCentavos: number;
  devolucionesEfectivoCentavos: number;
  cantidadVentas: number;
  totalVendidoCentavos: number;
}

/**
 * Los totales salen de los movimientos, no de una columna acumulada: si se
 * llevara un acumulador, cualquier corte a mitad de escritura lo dejaría
 * mintiendo y nadie se enteraría hasta el cierre.
 */
export async function totalesDeSesion(cajaSesionId: string): Promise<TotalesDeSesion> {
  const [porTipo, ventas] = await Promise.all([
    prisma.movimientoCaja.groupBy({
      by: ['tipo'],
      where: { cajaSesionId },
      _sum: { montoCentavos: true },
    }),
    prisma.venta.aggregate({
      where: { cajaSesionId, estado: 'completada' },
      _count: { _all: true },
      _sum: { totalCentavos: true },
    }),
  ]);

  const suma = (tipo: string) =>
    porTipo.find((fila) => fila.tipo === tipo)?._sum.montoCentavos ?? 0;

  return {
    ventasEfectivoCentavos: suma('venta'),
    ingresosCentavos: suma('ingreso'),
    retirosCentavos: suma('retiro'),
    devolucionesEfectivoCentavos: suma('devolucion'),
    cantidadVentas: ventas._count._all,
    totalVendidoCentavos: ventas._sum.totalCentavos ?? 0,
  };
}

export function cerrarSesion(
  id: string,
  datos: {
    montoDeclaradoCentavos: number;
    montoEsperadoCentavos: number;
    diferenciaCentavos: number;
  },
) {
  return prisma.cajaSesion.update({
    where: { id },
    data: { ...datos, estado: 'cerrada', cerradaEn: new Date() },
  });
}

export function listarSesiones(limite = 60) {
  return prisma.cajaSesion.findMany({
    orderBy: { abiertaEn: 'desc' },
    take: limite,
    include: { usuario: { select: { nombre: true } } },
  });
}
