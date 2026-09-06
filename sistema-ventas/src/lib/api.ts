import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CODIGOS, ErrorApp, esErrorApp, type DetalleCampo } from './error-app';
import { nuevoRequestId, registro } from './registro';

/**
 * El borde HTTP. Único lugar donde un error se convierte en respuesta.
 *
 * Formato de error uniforme (§8.5): `{ error: { codigo, mensaje } }`.
 * Un route handler que no pase por acá va a devolver otra forma y el cliente
 * va a tener que adivinar, así que todos pasan.
 */

export interface CuerpoError {
  error: { codigo: string; mensaje: string; detalles?: DetalleCampo[] };
}

export function respuestaOk<T>(datos: T, status = 200): NextResponse<T> {
  return NextResponse.json(datos, { status });
}

export function respuestaError(error: ErrorApp): NextResponse<CuerpoError> {
  return NextResponse.json(
    {
      error: {
        codigo: error.codigo,
        mensaje: error.message,
        ...(error.detalles.length > 0 ? { detalles: error.detalles } : {}),
      },
    },
    { status: error.statusHttp },
  );
}

/**
 * Envuelve un handler: valida que lo inesperado quede logueado entero y que
 * al cliente le llegue siempre la misma forma. Nunca sale un mensaje de Prisma.
 */
export async function manejar<T>(
  accion: (requestId: string) => Promise<NextResponse<T>>,
): Promise<NextResponse<T | CuerpoError>> {
  const requestId = nuevoRequestId();
  try {
    return await accion(requestId);
  } catch (error) {
    if (esErrorApp(error)) {
      if (error.statusHttp >= 500) registro.error('Error de aplicación', error, { requestId });
      return respuestaError(error);
    }
    registro.error('Error inesperado', error, { requestId });
    return respuestaError(
      new ErrorApp(
        CODIGOS.ERROR_INTERNO,
        'Algo falló de nuestro lado. Probá de nuevo; si sigue, avisale al encargado.',
        500,
      ),
    );
  }
}

/**
 * Valida con Zod y traduce el fallo a un ErrorApp con los campos adentro,
 * para que el formulario pueda pintar el error debajo del campo que lo causó.
 */
export function validar<S extends z.ZodType>(esquema: S, valor: unknown): z.output<S> {
  const resultado = esquema.safeParse(valor);
  if (resultado.success) return resultado.data;

  const detalles: DetalleCampo[] = resultado.error.issues.map((problema) => ({
    campo: problema.path.join('.') || '(cuerpo)',
    mensaje: problema.message,
  }));
  const primero = detalles[0];
  throw ErrorApp.datosInvalidos(primero ? primero.mensaje : 'Los datos enviados no son válidos.', detalles);
}

/** Lee el cuerpo JSON sin romperse si viene vacío o mal formado. */
export async function leerCuerpo(peticion: Request): Promise<unknown> {
  try {
    return await peticion.json();
  } catch {
    throw ErrorApp.datosInvalidos('El cuerpo de la petición no es JSON válido.');
  }
}

/** Lee los parámetros de la query string como objeto plano. */
export function leerQuery(peticion: Request): Record<string, string> {
  return Object.fromEntries(new URL(peticion.url).searchParams.entries());
}
