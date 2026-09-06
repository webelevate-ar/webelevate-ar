import type { ClientePrisma } from '../prisma';
import { prisma } from '../prisma';

/**
 * Registro de auditoría (§8.7). Guarda quién, cuándo, qué había antes y qué
 * quedó después. Además de servir para investigar, es un argumento de venta:
 * al dueño se le muestra esta pantalla y ve todo lo que tocó cada empleado.
 */

export interface EntradaAuditoria {
  usuarioId: string;
  accion: string;
  entidad: string;
  entidadId: string;
  datosAntes?: unknown;
  datosDespues?: unknown;
  ip?: string | null;
}

export function registrar(entrada: EntradaAuditoria, cliente: ClientePrisma = prisma) {
  return cliente.auditLog.create({
    data: {
      usuarioId: entrada.usuarioId,
      accion: entrada.accion,
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      datosAntes: entrada.datosAntes === undefined ? null : JSON.stringify(entrada.datosAntes),
      datosDespues:
        entrada.datosDespues === undefined ? null : JSON.stringify(entrada.datosDespues),
      ip: entrada.ip ?? null,
    },
  });
}

export function listar(limite = 100) {
  return prisma.auditLog.findMany({
    orderBy: { creadoEn: 'desc' },
    take: limite,
    include: { usuario: { select: { nombre: true, rol: true } } },
  });
}
