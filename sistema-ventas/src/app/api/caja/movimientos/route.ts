import { leerCuerpo, leerQuery, manejar, respuestaOk, validar } from '@/lib/api';
import { ErrorApp } from '@/lib/error-app';
import { ipDe } from '@/lib/limite-peticiones';
import { estadoActual, movimientosDe, registrarMovimiento } from '@/lib/servicios/caja';
import { requerirSesion } from '@/lib/sesion';
import { esquemaMovimientoCaja } from '@/lib/validacion/esquemas';

export async function GET(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirSesion();
    const { cajaSesionId } = leerQuery(peticion);

    if (cajaSesionId) return respuestaOk({ movimientos: await movimientosDe(cajaSesionId) });

    const estado = await estadoActual(sesion);
    if (!estado.sesion) throw ErrorApp.noEncontrado('No tenés una caja abierta.');
    return respuestaOk({ movimientos: await movimientosDe(estado.sesion.id) });
  });
}

/** Retiro o ingreso de plata durante el turno. */
export async function POST(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirSesion();
    const datos = validar(esquemaMovimientoCaja, await leerCuerpo(peticion));
    const movimiento = await registrarMovimiento(datos, sesion, ipDe(peticion));
    return respuestaOk({ movimiento }, 201);
  });
}
