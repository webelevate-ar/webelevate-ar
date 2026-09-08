import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion';
import { PantallaCaja } from './pantalla-caja';

export default async function PaginaCaja() {
  const sesion = await sesionActual();
  if (!sesion) redirect('/ingresar');

  return <PantallaCaja usuarioId={sesion.usuarioId} />;
}
