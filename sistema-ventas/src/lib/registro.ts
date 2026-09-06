/**
 * Log estructurado en JSON con un `requestId` que atraviesa toda la petición
 * (§10). Sin esto, cuando el dueño dice "a las siete algo salió mal", no hay
 * forma de juntar las cinco líneas que pertenecen a la misma venta.
 *
 * No hay `console.log`: acá se registra, en el resto del código se lanza un
 * ErrorApp (§17).
 */

type Nivel = 'info' | 'aviso' | 'error';

export interface ContextoRegistro {
  requestId?: string;
  usuarioId?: string;
  cajaSesionId?: string;
  [clave: string]: unknown;
}

function escribir(nivel: Nivel, mensaje: string, contexto: ContextoRegistro = {}): void {
  const linea = JSON.stringify({
    nivel,
    mensaje,
    momento: new Date().toISOString(),
    ...contexto,
  });
  if (nivel === 'error') console.error(linea);
  else console.warn(linea);
}

export const registro = {
  info: (mensaje: string, contexto?: ContextoRegistro) => escribir('info', mensaje, contexto),
  aviso: (mensaje: string, contexto?: ContextoRegistro) => escribir('aviso', mensaje, contexto),
  error: (mensaje: string, error: unknown, contexto?: ContextoRegistro) =>
    escribir('error', mensaje, {
      ...contexto,
      error: error instanceof Error ? { nombre: error.name, mensaje: error.message } : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
};

export function nuevoRequestId(): string {
  return crypto.randomUUID();
}
