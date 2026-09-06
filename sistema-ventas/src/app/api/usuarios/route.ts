import { manejar, respuestaOk } from '@/lib/api';
import { listarUsuariosParaElegir } from '@/lib/servicios/autenticacion';

/**
 * Los usuarios que se pueden elegir en la pantalla de ingreso.
 *
 * No exige sesión —es la pantalla previa a tener una— y por eso devuelve
 * únicamente id, nombre y rol. El `pinHash` no sale de la base para esto.
 */
export async function GET() {
  return manejar(async () => respuestaOk({ usuarios: await listarUsuariosParaElegir() }));
}
