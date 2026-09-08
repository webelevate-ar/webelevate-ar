import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion';
import { PantallaPendientes } from './pantalla-pendientes';

export default async function PaginaPendientes() {
  const sesion = await sesionActual();
  if (!sesion) redirect('/ingresar');

  return <PantallaPendientes usuarioId={sesion.usuarioId} rol={sesion.rol} />;
}
