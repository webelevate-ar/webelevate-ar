/**
 * Cliente HTTP del navegador.
 *
 * Traduce el error uniforme del servidor —`{ error: { codigo, mensaje } }`— a
 * una excepción con el mensaje ya listo para mostrar. Así ninguna pantalla
 * tiene que inventar un texto para un fallo, que es de donde salen los
 * "Error 500" en la cara del cajero (§7.2).
 *
 * Además es el único lugar del sistema que sabe, de verdad, si se llega al
 * servidor: cada petición que pasa por acá actualiza el estado de conexión.
 */

import { marcarAlcanzable, marcarInalcanzable } from './offline/conexion';

export class ErrorDeApi extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly detalles: { campo: string; mensaje: string }[];

  constructor(
    codigo: string,
    mensaje: string,
    status: number,
    detalles: { campo: string; mensaje: string }[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
    this.codigo = codigo;
    this.status = status;
    this.detalles = detalles;
  }
}

interface CuerpoDeError {
  error?: { codigo?: string; mensaje?: string; detalles?: { campo: string; mensaje: string }[] };
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...(opciones.headers ?? {}) },
    });
    // Cualquier respuesta, aunque sea un 500, prueba que se llega al servidor.
    // Es la única señal confiable de que hay conexión: ver offline/conexion.ts.
    marcarAlcanzable();
  } catch {
    // Sin red no hay `status`: el mensaje tiene que decir eso y no "falló algo".
    marcarInalcanzable();
    throw new ErrorDeApi(
      'SIN_CONEXION',
      'No hay conexión con el servidor. Revisá la red y probá de nuevo.',
      0,
    );
  }

  if (respuesta.status === 204) return undefined as T;

  const texto = await respuesta.text();
  const cuerpo: unknown = texto ? JSON.parse(texto) : {};

  if (!respuesta.ok) {
    const error = (cuerpo as CuerpoDeError).error;
    throw new ErrorDeApi(
      error?.codigo ?? 'ERROR_INTERNO',
      error?.mensaje ?? 'Algo falló y no sabemos qué. Probá de nuevo.',
      respuesta.status,
      error?.detalles ?? [],
    );
  }

  return cuerpo as T;
}

export const api = {
  get: <T>(ruta: string) => pedir<T>(ruta),
  post: <T>(ruta: string, cuerpo?: unknown) =>
    pedir<T>(ruta, { method: 'POST', body: JSON.stringify(cuerpo ?? {}) }),
  put: <T>(ruta: string, cuerpo: unknown) =>
    pedir<T>(ruta, { method: 'PUT', body: JSON.stringify(cuerpo) }),
  delete: <T>(ruta: string) => pedir<T>(ruta, { method: 'DELETE' }),
};

/** Convierte cualquier error en un texto mostrable. Nunca devuelve vacío. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorDeApi) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Algo falló y no sabemos qué. Probá de nuevo.';
}
