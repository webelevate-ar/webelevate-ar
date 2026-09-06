import { redirect } from 'next/navigation';
import { sesionActual } from '@/lib/sesion';
import { FormularioIngreso } from './formulario-ingreso';

export default async function PaginaIngresar() {
  // Si ya hay sesión, entrar de nuevo no tiene sentido: va derecho a vender.
  if (await sesionActual()) redirect('/venta');
  return <FormularioIngreso />;
}
