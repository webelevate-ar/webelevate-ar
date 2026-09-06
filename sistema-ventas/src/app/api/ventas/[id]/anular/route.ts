import { leerCuerpo, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe } from '@/lib/limite-peticiones';
import { anular } from '@/lib/servicios/ventas';
import { requerirRol, ROLES_SUPERVISION } from '@/lib/sesion';
import { esquemaAnularVenta } from '@/lib/validacion/esquemas';

/** Anular una venta. Solo Supervisor o Admin (§8.6), verificado acá. */
export async function POST(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const sesion = await requerirRol(ROLES_SUPERVISION);
    const { id } = await contexto.params;
    const { motivo } = validar(esquemaAnularVenta, await leerCuerpo(peticion));
    const venta = await anular(id, motivo, sesion, ipDe(peticion));
    return respuestaOk({ venta });
  });
}
