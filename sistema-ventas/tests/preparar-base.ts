import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Base de datos temporal para los tests de integración.
 *
 * Cada corrida crea un archivo SQLite nuevo y le aplica las migraciones
 * versionadas —las mismas que van a producción, no un `db push`—. Así el test
 * prueba el esquema real y no una versión paralela que se desincroniza sola.
 */

let carpeta: string | null = null;

export function crearBaseDePrueba(): string {
  carpeta = mkdtempSync(path.join(tmpdir(), 'sistema-ventas-test-'));
  const archivo = path.join(carpeta, 'prueba.db');
  const url = `file:${archivo}`;

  process.env.DATABASE_URL = url;
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return url;
}

export function borrarBaseDePrueba(): void {
  if (carpeta) rmSync(carpeta, { recursive: true, force: true });
  carpeta = null;
}
