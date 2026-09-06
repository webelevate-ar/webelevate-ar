import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { BarraNavegacion } from '@/components/pos/barra-navegacion';
import { sesionActual } from '@/lib/sesion';

/**
 * Todo lo que cuelga de acá exige sesión. La comprobación está en el servidor
 * y se repite en cada endpoint: este layout evita mostrar la pantalla, no
 * reemplaza la autorización de la API (§8.6).
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const sesion = await sesionActual();
  if (!sesion) redirect('/ingresar');

  return (
    <div className="flex min-h-screen flex-col">
      <BarraNavegacion nombre={sesion.nombre} rol={sesion.rol} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
