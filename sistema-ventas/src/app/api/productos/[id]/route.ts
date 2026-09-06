import { leerCuerpo, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe } from '@/lib/limite-peticiones';
import { actualizar } from '@/lib/servicios/catalogo';
import { requerirRol, ROLES_SUPERVISION } from '@/lib/sesion';
import { esquemaProducto } from '@/lib/validacion/esquemas';

export async function PUT(peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    const sesion = await requerirRol(ROLES_SUPERVISION);
    const { id } = await contexto.params;
    const datos = validar(esquemaProducto, await leerCuerpo(peticion));
    return respuestaOk({ producto: await actualizar(id, datos, sesion, ipDe(peticion)) });
  });
}
