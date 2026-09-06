import { sesionActual } from '@/lib/sesion';
import { PantallaStock } from './pantalla-stock';

export default async function PaginaStock() {
  const sesion = await sesionActual();
  const puedeMover = sesion?.rol === 'ADMIN' || sesion?.rol === 'SUPERVISOR';
  return <PantallaStock puedeMover={puedeMover} />;
}
