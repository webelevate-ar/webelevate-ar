import { manejar, respuestaOk } from '@/lib/api';
import { listarSesiones } from '@/lib/servicios/caja';
import { requerirRol, ROLES_SUPERVISION } from '@/lib/sesion';

/** Historial de cierres. Es la pantalla donde el dueño ve los faltantes. */
export async function GET() {
  return manejar(async () => {
    await requerirRol(ROLES_SUPERVISION);
    return respuestaOk({ sesiones: await listarSesiones() });
  });
}
