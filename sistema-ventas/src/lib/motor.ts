/**
 * Qué motor hay abajo. Un solo lugar que lo diga, para que nadie tenga que
 * volver a leer `process.env` y adivinar el valor por defecto.
 */
export const MOTOR = process.env.MOTOR === 'postgresql' ? 'postgresql' : 'sqlite';
export const esPostgres = MOTOR === 'postgresql';

/** Nombre de la secuencia de números de venta en PostgreSQL. */
export const SECUENCIA_VENTA = 'venta_numero_seq';
