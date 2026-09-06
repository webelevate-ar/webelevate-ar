import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 saca la URL del esquema del `datasource` y la pone acá.
 *
 * El adaptador NO va en este archivo: el CLI de migraciones no lo acepta. Vive
 * en src/lib/prisma.ts, que es el único lugar del proyecto que sabe qué motor
 * hay abajo. Para pasar a PostgreSQL se cambia `PrismaBetterSqlite3` por
 * `PrismaPg` allá, y el `provider` del esquema acá al lado
 * (§3: SQLite en desarrollo local, PostgreSQL en producción).
 */
const url = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: { url },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
