import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion';
import { PantallaPanel } from './pantalla-panel';

export default async function PaginaPanel() {
  // El panel muestra margen: lo ven Supervisor y Admin. La API vuelve a
  // comprobarlo; esto solo evita pintar una pantalla que no le corresponde.
  const sesion = await sesionActual();
  if (!sesion) redirect('/ingresar');
  if (sesion.rol === 'CAJERO') redirect('/venta');

  return <PantallaPanel />;
}
