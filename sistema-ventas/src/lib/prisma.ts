import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

/**
 * Único lugar donde se instancia el cliente de la base.
 *
 * En desarrollo Next recarga los módulos en cada cambio; sin el singleton se
 * abriría una conexión nueva por recarga hasta agotar el pool.
 *
 * El adaptador es lo único que sabe qué motor hay abajo. Para PostgreSQL se
 * cambia `PrismaBetterSqlite3` por `PrismaPg` y nada más de este archivo.
 */

const globalConPrisma = globalThis as unknown as { prisma?: PrismaClient };

function crearCliente(): PrismaClient {
  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalConPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== 'production') globalConPrisma.prisma = prisma;

/**
 * Tipo del cliente dentro de una transacción. Los repositorios lo aceptan para
 * poder participar de la transacción de la venta en vez de abrir la suya.
 */
export type ClientePrisma = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
