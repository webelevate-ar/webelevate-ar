import { Suspense } from 'react';
import { EsqueletoFilas } from '@/components/ui/estados';
import { sesionActual } from '@/lib/sesion';
import { PantallaHistorial } from './pantalla-historial';

export default async function PaginaHistorial() {
  const sesion = await sesionActual();
  const puedeAnular = sesion?.rol === 'ADMIN' || sesion?.rol === 'SUPERVISOR';

  return (
    // `useSearchParams` obliga a un límite de Suspense: sin esto, Next no puede
    // renderizar la ruta y el build falla.
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6">
          <EsqueletoFilas filas={8} />
        </div>
      }
    >
      <PantallaHistorial puedeAnular={puedeAnular} />
    </Suspense>
  );
}
