import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 saca la URL del esquema del `datasource` y la pone acá.
 *
 * El adaptador NO va en este archivo: el CLI de migraciones no lo acepta. Vive
 * en src/lib/prisma.ts, que es el único lugar del proyecto que sabe qué motor
 * hay abajo.
 *
 * ─── Los dos motores ────────────────────────────────────────────────────────
 *
 * SQLite es el de por defecto: no hay nada que instalar y el proyecto arranca
 * con un comando. PostgreSQL es el de producción.
 *
 * Prisma **no** acepta `provider = env("...")` —probado, da error de
 * validación—, así que el esquema de PostgreSQL se **deriva** del de SQLite
 * cambiando esa única línea. Derivarlo y no copiarlo es la diferencia entre un
 * archivo y dos: con dos, el día que alguien agregue un campo lo agrega en uno
 * solo y nadie se entera hasta que falla una migración.
 *
 *   MOTOR=postgresql npm run bd:migrar
 */

const motor = process.env.MOTOR === 'postgresql' ? 'postgresql' : 'sqlite';
const esPostgres = motor === 'postgresql';

const esquemaBase = path.join('prisma', 'schema.prisma');
const esquemaDerivado = path.join('prisma', 'schema.postgresql.prisma');

if (esPostgres) {
  const contenido = readFileSync(esquemaBase, 'utf8').replace(
    /provider = "sqlite"/,
    'provider = "postgresql"',
  );
  writeFileSync(esquemaDerivado, contenido);
}

const url =
  process.env.DATABASE_URL ?? (esPostgres ? '' : 'file:./prisma/dev.db');

export default defineConfig({
  schema: esPostgres ? esquemaDerivado : esquemaBase,
  datasource: { url },
  migrations: {
    // Cada motor tiene su carpeta: el SQL que genera SQLite no es válido en
    // PostgreSQL y al revés. Compartir carpeta rompe el historial de los dos.
    path: path.join('prisma', esPostgres ? 'migrations-postgresql' : 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
