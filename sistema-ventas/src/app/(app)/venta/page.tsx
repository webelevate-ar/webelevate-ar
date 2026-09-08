import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion';
import { PantallaVenta } from './pantalla-venta';

/**
 * Quién cobra se resuelve en el servidor y baja a la pantalla.
 *
 * Hace falta porque una venta cobrada sin conexión se guarda en esta PC con el
 * id de quien la cobró: al sincronizar tiene que entrar en la caja de esa
 * persona y no en la de quien esté logueado en ese momento.
 */
export default async function PaginaVenta() {
  const sesion = await sesionActual();
  if (!sesion) redirect('/ingresar');

  return <PantallaVenta usuarioId={sesion.usuarioId} nombre={sesion.nombre} />;
}
