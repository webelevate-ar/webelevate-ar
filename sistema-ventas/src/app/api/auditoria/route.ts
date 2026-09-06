import { manejar, respuestaOk } from '@/lib/api';
import { listarAuditoria } from '@/lib/servicios/auditoria';
import { requerirRol, ROLES_SUPERVISION } from '@/lib/sesion';

export async function GET() {
  return manejar(async () => {
    await requerirRol(ROLES_SUPERVISION);
    return respuestaOk({ entradas: await listarAuditoria() });
  });
}
