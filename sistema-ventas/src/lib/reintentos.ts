/**
 * Reintento de transacciones que la base aborta por conflicto.
 *
 * ⚠️ Por qué existe. Las ventas se crean con aislamiento `Serializable`, que es
 * lo correcto: con tres cajas cobrando el mismo producto, es lo único que
 * garantiza que las dos ventas se registren y el stock baje dos veces.
 *
 * Pero `Serializable` **no espera: aborta**. Cuando PostgreSQL detecta que dos
 * transacciones no se pueden ordenar entre sí, tumba una con el código `40001`,
 * `could not serialize access due to concurrent update`, y espera que el
 * programa la vuelva a intentar. Sin reintento, el segundo cajero ve un error
 * y la venta no sale.
 *
 * En SQLite esto no pasa nunca —escribe de a uno— así que los tests de
 * concurrencia pasaban en verde y el bug solo apareció al correrlos contra un
 * PostgreSQL de verdad. Es la trampa 70.
 */

import { registro } from './registro';

/*
 * Ocho intentos con espera creciente dan hasta unos 3 segundos de margen. Suena
 * mucho, pero el reintento solo ocurre cuando ya hubo conflicto: en el camino
 * normal no cuesta nada. Y el techo medido con este presupuesto es de unas 20
 * ventas simultáneas, muy por encima de las 3 cajas del pliego.
 */
const INTENTOS = 8;
const ESPERA_BASE_MS = 25;

/**
 * Señales de "volvé a intentarlo, no es tu culpa".
 *
 * ⚠️ Hay que mirar las dos familias, y esto costó una corrida entender: cuando
 * el conflicto ocurre en un `$queryRaw`, el error llega con el código crudo de
 * PostgreSQL (`40001`). Cuando ocurre en una consulta tipada, **Prisma lo
 * traduce** a su propio `P2034` y el `40001` ya no aparece por ningún lado. Un
 * detector que solo mirara el código crudo dejaría sin reintentar justo el caso
 * más común: dos cajas descontando el mismo producto.
 */
const SENIALES_REINTENTABLES = [
  '40001', // PostgreSQL: serialization_failure
  '40P01', // PostgreSQL: deadlock_detected
  'P2034', // Prisma: "write conflict or a deadlock"
  'write conflict',
  'deadlock',
];

function esConflictoDeSerializacion(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const texto = `${error.message} ${'code' in error ? String(error.code) : ''}`.toLowerCase();
  return SENIALES_REINTENTABLES.some((senial) => texto.includes(senial.toLowerCase()));
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Corre una transacción y la reintenta si la base la abortó por conflicto.
 *
 * La espera crece y lleva algo de azar: si las dos transacciones que chocaron
 * reintentaran exactamente al mismo tiempo, volverían a chocar.
 */
export async function conReintentos<T>(descripcion: string, accion: () => Promise<T>): Promise<T> {
  let ultimoError: unknown;

  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    try {
      return await accion();
    } catch (error) {
      if (!esConflictoDeSerializacion(error)) throw error;

      ultimoError = error;
      if (intento === INTENTOS) break;

      const espera = ESPERA_BASE_MS * 2 ** (intento - 1) + Math.floor(Math.random() * 20);
      registro.aviso('Conflicto de serialización, reintentando', {
        descripcion,
        intento,
        esperaMs: espera,
      });
      await esperar(espera);
    }
  }

  registro.error(`No se pudo completar ${descripcion} tras ${INTENTOS} intentos`, ultimoError);
  throw ultimoError;
}
