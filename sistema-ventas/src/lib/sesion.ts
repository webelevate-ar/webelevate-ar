import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { ErrorApp } from './error-app';
import { type Rol } from './validacion/enums';

/**
 * Sesión del cajero.
 *
 * La cookie es `httpOnly`, `secure` y `sameSite=lax`, y lleva el contenido
 * firmado con HMAC: el navegador la ve pero no la puede modificar sin romper
 * la firma. No se guarda nada sensible adentro, solo el id, el nombre y el rol.
 *
 * Expira por turno (12 horas): un cajero que se olvida de salir no deja la
 * sesión abierta hasta la semana que viene.
 */

const NOMBRE_COOKIE = 'sesion';
const HORAS_DE_TURNO = 12;

export interface SesionUsuario {
  usuarioId: string;
  nombre: string;
  rol: Rol;
  /** Momento de vencimiento, en milisegundos desde epoch. */
  vence: number;
}

function secreto(): string {
  const valor = process.env.COOKIE_SECRETO;
  if (!valor || valor.length < 16) {
    throw new Error(
      'Falta COOKIE_SECRETO, o es demasiado corto. Poné una cadena larga y aleatoria en .env',
    );
  }
  return valor;
}

function firmar(carga: string): string {
  return createHmac('sha256', secreto()).update(carga).digest('base64url');
}

export function serializarSesion(sesion: SesionUsuario): string {
  const carga = Buffer.from(JSON.stringify(sesion), 'utf8').toString('base64url');
  return `${carga}.${firmar(carga)}`;
}

export function leerSesionDeTexto(texto: string | undefined): SesionUsuario | null {
  if (!texto) return null;
  const [carga, firma] = texto.split('.');
  if (!carga || !firma) return null;

  const esperada = Buffer.from(firmar(carga), 'utf8');
  const recibida = Buffer.from(firma, 'utf8');
  // Comparación de tiempo constante: comparar con === filtra la firma byte a byte.
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const sesion = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as SesionUsuario;
    if (typeof sesion.vence !== 'number' || sesion.vence < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
}

export function vencimientoDeTurno(): number {
  return Date.now() + HORAS_DE_TURNO * 60 * 60 * 1000;
}

export async function guardarCookieSesion(sesion: SesionUsuario): Promise<void> {
  const almacen = await cookies();
  almacen.set(NOMBRE_COOKIE, serializarSesion(sesion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(sesion.vence),
  });
}

export async function borrarCookieSesion(): Promise<void> {
  const almacen = await cookies();
  almacen.delete(NOMBRE_COOKIE);
}

/** La sesión actual, o `null` si no hay. No lanza: el que llama decide. */
export async function sesionActual(): Promise<SesionUsuario | null> {
  const almacen = await cookies();
  return leerSesionDeTexto(almacen.get(NOMBRE_COOKIE)?.value);
}

/** La sesión actual, o error 401. Para todo lo que necesite estar identificado. */
export async function requerirSesion(): Promise<SesionUsuario> {
  const sesion = await sesionActual();
  if (!sesion) throw ErrorApp.noAutenticado();
  return sesion;
}

/**
 * Autorización. Se verifica en el servidor, en cada endpoint (§8.6):
 * esconder un botón en la interfaz no es seguridad, es decoración.
 */
export async function requerirRol(roles: readonly Rol[]): Promise<SesionUsuario> {
  const sesion = await requerirSesion();
  if (!roles.includes(sesion.rol)) {
    throw ErrorApp.sinPermiso('Esta acción la tiene que autorizar un supervisor.');
  }
  return sesion;
}

/** Quién puede anular, descontar, ajustar stock y ver el margen (§8.6). */
export const ROLES_SUPERVISION = ['ADMIN', 'SUPERVISOR'] as const satisfies readonly Rol[];
export const TODOS_LOS_ROLES = ['ADMIN', 'SUPERVISOR', 'CAJERO'] as const satisfies readonly Rol[];
