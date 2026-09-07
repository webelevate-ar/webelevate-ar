import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Base de datos limpia para los tests de integración.
 *
 * Cada corrida aplica las migraciones versionadas —las mismas que van a
 * producción, no un `db push`—, así el test prueba el esquema real.
 *
 * Corre contra los dos motores:
 *
 *   npm run test                          SQLite, archivo temporal
 *   MOTOR=postgresql DATABASE_URL=... npm run test
 *
 * Con PostgreSQL se crea un **esquema** propio por corrida en vez de una base
 * nueva: crear una base pide permisos que un Neon o un Postgres administrado no
 * siempre dan, y un esquema alcanza para aislar.
 */

let carpeta: string | null = null;
let esquemaPostgres: string | null = null;
let urlPostgres: string | null = null;

export const esPostgres = process.env.MOTOR === 'postgresql';

export function crearBaseDePrueba(): string {
  if (esPostgres) return crearEsquemaPostgres();
  return crearArchivoSqlite();
}

function crearArchivoSqlite(): string {
  carpeta = mkdtempSync(path.join(tmpdir(), 'sistema-ventas-test-'));
  const url = `file:${path.join(carpeta, 'prueba.db')}`;
  process.env.DATABASE_URL = url;
  migrar(url);
  return url;
}

function crearEsquemaPostgres(): string {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Con MOTOR=postgresql hace falta DATABASE_URL.');

  esquemaPostgres = `prueba_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const url = new URL(base);
  url.searchParams.set('schema', esquemaPostgres);
  urlPostgres = url.toString();

  process.env.DATABASE_URL = urlPostgres;
  migrar(urlPostgres);
  return urlPostgres;
}

function migrar(url: string): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

export function borrarBaseDePrueba(): void {
  if (carpeta) {
    rmSync(carpeta, { recursive: true, force: true });
    carpeta = null;
    return;
  }

  if (esquemaPostgres && urlPostgres) {
    // El esquema se borra con su contenido; si quedara, la corrida siguiente
    // dejaría basura acumulándose en la base de pruebas.
    // `psql` rechaza `?schema=`: no es un parámetro suyo, es de Prisma.
    const sinParametros = new URL(urlPostgres);
    sinParametros.search = '';
    execFileSync(
      'psql',
      [sinParametros.toString(), '-c', `DROP SCHEMA IF EXISTS "${esquemaPostgres}" CASCADE;`],
      { stdio: 'pipe' },
    );
    esquemaPostgres = null;
    urlPostgres = null;
  }
}
