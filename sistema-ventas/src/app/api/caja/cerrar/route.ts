import { leerCuerpo, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe } from '@/lib/limite-peticiones';
import { cerrar } from '@/lib/servicios/caja';
import { requerirSesion } from '@/lib/sesion';
import { esquemaCerrarCaja } from '@/lib/validacion/esquemas';

/**
 * Cierre con arqueo ciego. El monto esperado y la diferencia se calculan y se
 * devuelven acá, después de recibir lo declarado: nunca antes.
 */
export async function POST(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirSesion();
    const { montoDeclaradoCentavos } = validar(esquemaCerrarCaja, await leerCuerpo(peticion));
    const resultado = await cerrar(montoDeclaradoCentavos, sesion, ipDe(peticion));
    return respuestaOk(resultado);
  });
}
