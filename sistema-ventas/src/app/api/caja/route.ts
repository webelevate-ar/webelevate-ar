import { leerCuerpo, manejar, respuestaOk, validar } from '@/lib/api';
import { abrir, estadoActual } from '@/lib/servicios/caja';
import { requerirSesion } from '@/lib/sesion';
import { esquemaAbrirCaja } from '@/lib/validacion/esquemas';

/** La caja abierta del usuario, con sus totales. */
export async function GET() {
  return manejar(async () => {
    const sesion = await requerirSesion();
    return respuestaOk(await estadoActual(sesion));
  });
}

/** Apertura de caja con el monto inicial. */
export async function POST(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirSesion();
    const datos = validar(esquemaAbrirCaja, await leerCuerpo(peticion));
    return respuestaOk({ sesion: await abrir(datos, sesion) }, 201);
  });
}
