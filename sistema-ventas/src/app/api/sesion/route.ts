import { leerCuerpo, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe, limitarPeticiones } from '@/lib/limite-peticiones';
import { ingresar } from '@/lib/servicios/autenticacion';
import { borrarCookieSesion, guardarCookieSesion, sesionActual } from '@/lib/sesion';
import { esquemaIngreso } from '@/lib/validacion/esquemas';

/** Quién está usando la caja ahora. */
export async function GET() {
  return manejar(async () => {
    const sesion = await sesionActual();
    return respuestaOk({ sesion });
  });
}

/** Ingreso con PIN. */
export async function POST(peticion: Request) {
  return manejar(async () => {
    const cuerpo = validar(esquemaIngreso, await leerCuerpo(peticion));

    // Además del bloqueo por usuario, un límite por IP: el bloqueo por usuario
    // se puede esquivar probando un PIN en cada usuario por vez.
    limitarPeticiones({
      clave: `ingreso:${ipDe(peticion)}`,
      maximo: 20,
      ventanaMs: 5 * 60_000,
      mensaje: 'Demasiados intentos desde este equipo. Esperá unos minutos.',
    });

    const sesion = await ingresar(cuerpo.usuarioId, cuerpo.pin);
    await guardarCookieSesion(sesion);
    return respuestaOk({ sesion });
  });
}

/** Salida. */
export async function DELETE() {
  return manejar(async () => {
    await borrarCookieSesion();
    return respuestaOk({ listo: true });
  });
}
