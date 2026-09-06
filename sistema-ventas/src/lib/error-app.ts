/**
 * El error de la aplicación (§8.5).
 *
 * Regla: si el error es esperado, se lanza con esta clase y su `mensaje` se le
 * muestra tal cual al usuario. Si es inesperado, se loguea completo y al
 * cliente le llega un mensaje genérico. Nunca sale un stack trace ni un
 * mensaje de Prisma hacia afuera: eso le dice a cualquiera cómo está armada
 * la base de datos.
 */

export const CODIGOS = {
  NO_AUTENTICADO: 'NO_AUTENTICADO',
  SIN_PERMISO: 'SIN_PERMISO',
  PIN_INCORRECTO: 'PIN_INCORRECTO',
  USUARIO_BLOQUEADO: 'USUARIO_BLOQUEADO',
  DATOS_INVALIDOS: 'DATOS_INVALIDOS',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  CONFLICTO: 'CONFLICTO',
  CAJA_CERRADA: 'CAJA_CERRADA',
  CAJA_YA_ABIERTA: 'CAJA_YA_ABIERTA',
  VENTA_YA_ANULADA: 'VENTA_YA_ANULADA',
  DEMASIADOS_INTENTOS: 'DEMASIADOS_INTENTOS',
  ERROR_INTERNO: 'ERROR_INTERNO',
} as const;

export type CodigoError = (typeof CODIGOS)[keyof typeof CODIGOS];

export interface DetalleCampo {
  campo: string;
  mensaje: string;
}

export class ErrorApp extends Error {
  readonly codigo: CodigoError;
  readonly statusHttp: number;
  readonly detalles: DetalleCampo[];

  constructor(
    codigo: CodigoError,
    mensaje: string,
    statusHttp: number,
    detalles: DetalleCampo[] = [],
  ) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.codigo = codigo;
    this.statusHttp = statusHttp;
    this.detalles = detalles;
  }

  static noAutenticado(mensaje = 'Iniciá sesión para continuar.') {
    return new ErrorApp(CODIGOS.NO_AUTENTICADO, mensaje, 401);
  }

  static sinPermiso(mensaje = 'Tu usuario no tiene permiso para hacer esto.') {
    return new ErrorApp(CODIGOS.SIN_PERMISO, mensaje, 403);
  }

  static noEncontrado(mensaje = 'No se encontró lo que buscabas.') {
    return new ErrorApp(CODIGOS.NO_ENCONTRADO, mensaje, 404);
  }

  static datosInvalidos(mensaje: string, detalles: DetalleCampo[] = []) {
    return new ErrorApp(CODIGOS.DATOS_INVALIDOS, mensaje, 422, detalles);
  }

  static conflicto(codigo: CodigoError, mensaje: string) {
    return new ErrorApp(codigo, mensaje, 409);
  }

  static demasiadosIntentos(mensaje: string) {
    return new ErrorApp(CODIGOS.DEMASIADOS_INTENTOS, mensaje, 429);
  }
}

export function esErrorApp(error: unknown): error is ErrorApp {
  return error instanceof ErrorApp;
}
