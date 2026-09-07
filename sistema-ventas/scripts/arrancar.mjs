#!/usr/bin/env node
/**
 * Arranca el sistema con un solo comando.
 *
 * Existe porque quien lo va a abrir no es programador: hoy hacían falta cuatro
 * comandos en orden y cualquiera de ellos, salteado, deja la pantalla en un
 * error que no explica nada. Este script hace los cuatro, se salta los que ya
 * están hechos, y si algo falla dice qué pasó en castellano.
 *
 *   npm run arrancar
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archivoEnv = path.join(raiz, '.env');
const baseSqlite = path.join(raiz, 'prisma', 'dev.db');

const VERSION_MINIMA_NODE = 20;

function decir(mensaje) {
  process.stdout.write(`${mensaje}\n`);
}

function fallar(titulo, comoArreglarlo) {
  decir('');
  decir(`✕  ${titulo}`);
  decir('');
  decir(comoArreglarlo);
  decir('');
  process.exit(1);
}

function correr(comando, opciones = {}) {
  execSync(comando, { cwd: raiz, stdio: 'pipe', ...opciones });
}

// ─── 1. Node ────────────────────────────────────────────────────────────────
const mayor = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(mayor) || mayor < VERSION_MINIMA_NODE) {
  fallar(
    `Este proyecto necesita Node ${VERSION_MINIMA_NODE} o más nuevo, y tenés el ${process.versions.node}.`,
    'Instalá la versión LTS desde https://nodejs.org y volvé a probar.',
  );
}

// ─── 2. Dependencias ────────────────────────────────────────────────────────
if (!existsSync(path.join(raiz, 'node_modules', 'next'))) {
  decir('Instalando lo que hace falta. La primera vez tarda unos minutos…');
  try {
    correr('npm install', { stdio: 'inherit' });
  } catch {
    fallar(
      'No se pudieron instalar las dependencias.',
      'Suele ser falta de internet. Revisá la conexión y volvé a correr:\n\n  npm run arrancar',
    );
  }
}

// ─── 3. Configuración ───────────────────────────────────────────────────────
// El secreto de la cookie se genera solo la primera vez. Pedirlo a mano sería
// un paso más para equivocarse, y dejarlo fijo en el repositorio sería peor.
if (!existsSync(archivoEnv)) {
  const secreto = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  writeFileSync(
    archivoEnv,
    `DATABASE_URL="file:./prisma/dev.db"\nCOOKIE_SECRETO="${secreto}"\n`,
  );
  decir('Configuración creada (.env), con un secreto de sesión nuevo.');
} else if (!readFileSync(archivoEnv, 'utf8').includes('COOKIE_SECRETO')) {
  fallar(
    'El archivo .env existe pero le falta COOKIE_SECRETO.',
    'Borralo y volvé a correr `npm run arrancar`, que lo genera de nuevo.',
  );
}

// ─── 4. Base de datos ───────────────────────────────────────────────────────
const baseEsNueva = !existsSync(baseSqlite);

try {
  decir(baseEsNueva ? 'Creando la base de datos…' : 'Revisando la base de datos…');
  correr('npx prisma migrate deploy');
  correr('npx prisma generate');
} catch (error) {
  fallar(
    'No se pudo preparar la base de datos.',
    `Detalle:\n\n${error instanceof Error ? error.message : String(error)}`,
  );
}

if (baseEsNueva) {
  decir('Cargando los datos de muestra. Son 400 productos y 1.500 ventas, tarda un rato…');
  try {
    correr('npm run bd:sembrar');
  } catch (error) {
    fallar(
      'No se pudieron cargar los datos de muestra.',
      `Detalle:\n\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// ─── 5. A andar ─────────────────────────────────────────────────────────────
decir('');
decir('──────────────────────────────────────────────');
decir('  Sistema de ventas');
decir('');
decir('  Abrí:  http://localhost:3000');
decir('');
decir('  PIN    Admin 1234 · Supervisor 2222 · Cajero 1111');
decir('');
decir('  Al entrar no hay caja abierta: abrila con un');
decir('  monto inicial antes de poder cobrar.');
decir('');
decir('  Para cortarlo, apretá Ctrl+C.');
decir('──────────────────────────────────────────────');
decir('');

const servidor = spawn('npm', ['run', 'dev'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

servidor.on('exit', (codigo) => process.exit(codigo ?? 0));
