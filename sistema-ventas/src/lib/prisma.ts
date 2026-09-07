import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Único lugar donde se instancia el cliente de la base, y el único que sabe
 * qué motor hay abajo.
 *
 * En desarrollo Next recarga los módulos en cada cambio; sin el singleton se
 * abriría una conexión nueva por recarga hasta agotar el pool.
 *
 * ─── Los dos motores ────────────────────────────────────────────────────────
 *
 * `MOTOR=postgresql` cambia el adaptador y nada más. Todo el resto del
 * proyecto —servicios, repositorios, pantallas— no se entera.
 *
 * ⚠️ **Cloudflare D1 no sirve para este sistema**, y no es una opinión: el
 * propio adaptador de Prisma lo dice en su código —
 *
 *   «D1 does not support transactions yet. When using Prisma's D1 adapter,
 *    implicit & explicit transactions will be ignored and run as individual
 *    queries, which breaks the guarantees of the ACID properties.»
 *
 * Una venta se crea entera dentro de una transacción. Sobre D1 esa transacción
 * se ignora: un corte a mitad de camino dejaría la venta cobrada sin ítems, o
 * el stock descontado sin venta. Es exactamente el bug que este proyecto existe
 * para evitar. Ver trampa 69 de `tiendas-base`.
 */

const globalConPrisma = globalThis as unknown as { prisma?: PrismaClient };

function crearCliente(): PrismaClient {
  const registro: ('warn' | 'error')[] =
    process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'];

  if (process.env.MOTOR === 'postgresql') {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('Falta DATABASE_URL para PostgreSQL.');

    /*
     * ⚠️ Dos cosas sobre `?schema=`, las dos aprendidas rompiéndose:
     *
     * 1. **El adaptador no lo lee de la URL.** Es un parámetro que entendía el
     *    motor viejo de Prisma; `pg` lo ignora sin decir nada y la conexión se
     *    va al esquema `public`.
     * 2. **Pasarlo como opción del adaptador tampoco alcanza.** Esa opción
     *    califica las consultas *generadas*, pero `$queryRaw` sigue yendo al
     *    `search_path` de la conexión. El síntoma fue peor que un error: las
     *    consultas tipadas iban a un esquema y las crudas a otro, sin fallar.
     *
     * Por eso se hacen las dos cosas: la opción del adaptador y el
     * `search_path` de la conexión, que es lo único que alcanza a todo.
     */
    const esquema = new URL(url).searchParams.get('schema') ?? undefined;
    return new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: url,
          ...(esquema ? { options: `-c search_path=${esquema}` } : {}),
        },
        esquema ? { schema: esquema } : undefined,
      ),
      log: registro,
    });
  }

  const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }), log: registro });
}

export const prisma = globalConPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== 'production') globalConPrisma.prisma = prisma;

/**
 * Tipo del cliente dentro de una transacción. Los repositorios lo aceptan para
 * poder participar de la transacción de la venta en vez de abrir la suya.
 */
export type ClientePrisma =
  PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
