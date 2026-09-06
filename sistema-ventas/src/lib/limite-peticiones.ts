import { ErrorApp } from './error-app';

/**
 * Límite de peticiones para los endpoints de escritura (§8.9).
 *
 * ⚠️ Es un contador en memoria del proceso. Alcanza para un comercio con tres
 * cajas contra una sola instancia, que es el caso real de este sistema. Si
 * mañana corre en varias instancias, hay que moverlo a Redis o a la base: con
 * dos procesos, cada uno cuenta la mitad y el límite deja de valer.
 * Está escrito acá para que quien lo despliegue lo sepa antes, no después.
 */

interface Ventana {
  cuenta: number;
  reinicioEn: number;
}

const ventanas = new Map<string, Ventana>();

export interface OpcionesLimite {
  clave: string;
  maximo: number;
  ventanaMs: number;
  mensaje?: string;
}

export function limitarPeticiones({ clave, maximo, ventanaMs, mensaje }: OpcionesLimite): void {
  const ahora = Date.now();
  const ventana = ventanas.get(clave);

  if (!ventana || ventana.reinicioEn <= ahora) {
    ventanas.set(clave, { cuenta: 1, reinicioEn: ahora + ventanaMs });
    limpiarVencidas(ahora);
    return;
  }

  ventana.cuenta += 1;
  if (ventana.cuenta > maximo) {
    const segundos = Math.ceil((ventana.reinicioEn - ahora) / 1000);
    throw ErrorApp.demasiadosIntentos(
      mensaje ?? `Demasiados intentos. Probá de nuevo en ${segundos} segundos.`,
    );
  }
}

/** Sin esto el Map crece para siempre con claves de peticiones viejas. */
function limpiarVencidas(ahora: number): void {
  if (ventanas.size < 500) return;
  for (const [clave, ventana] of ventanas) {
    if (ventana.reinicioEn <= ahora) ventanas.delete(clave);
  }
}

/** La IP del cliente, mirando las cabeceras que pone el proxy. */
export function ipDe(peticion: Request): string {
  const cabeceras = peticion.headers;
  const reenviada = cabeceras.get('x-forwarded-for');
  if (reenviada) return reenviada.split(',')[0]?.trim() ?? 'desconocida';
  return cabeceras.get('x-real-ip') ?? 'desconocida';
}
