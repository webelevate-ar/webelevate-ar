import { manejar, respuestaOk } from '@/lib/api';
import { resumen } from '@/lib/servicios/panel';
import { requerirRol, ROLES_SUPERVISION } from '@/lib/sesion';

/** El panel muestra margen, así que lo ven Supervisor y Admin, no el cajero (§8.6). */
export async function GET() {
  return manejar(async () => {
    await requerirRol(ROLES_SUPERVISION);
    return respuestaOk(await resumen());
  });
}
