import { prisma } from '../prisma';

/**
 * Repositorio de usuarios. Único lugar que toca Prisma para esta entidad
 * (§8.1). El `pinHash` sale de acá solo para la función que compara: no se
 * devuelve nunca en un listado.
 */

export interface UsuarioParaElegir {
  id: string;
  nombre: string;
  rol: string;
}

export function listarActivos(): Promise<UsuarioParaElegir[]> {
  return prisma.usuario.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, rol: true },
    orderBy: { nombre: 'asc' },
  });
}

export function buscarPorId(id: string) {
  return prisma.usuario.findUnique({ where: { id } });
}

export function buscarPorRoles(roles: readonly string[]) {
  return prisma.usuario.findMany({ where: { activo: true, rol: { in: [...roles] } } });
}

export async function registrarIntentoFallido(
  id: string,
  maximoIntentos: number,
  minutosBloqueo: number,
): Promise<{ intentos: number; bloqueadoHasta: Date | null }> {
  const usuario = await prisma.usuario.update({
    where: { id },
    data: { intentosFallidos: { increment: 1 } },
    select: { intentosFallidos: true },
  });

  if (usuario.intentosFallidos < maximoIntentos) {
    return { intentos: usuario.intentosFallidos, bloqueadoHasta: null };
  }

  const bloqueadoHasta = new Date(Date.now() + minutosBloqueo * 60_000);
  await prisma.usuario.update({
    where: { id },
    data: { bloqueadoHasta, intentosFallidos: 0 },
  });
  return { intentos: usuario.intentosFallidos, bloqueadoHasta };
}

export function limpiarIntentos(id: string) {
  return prisma.usuario.update({
    where: { id },
    data: { intentosFallidos: 0, bloqueadoHasta: null },
  });
}
