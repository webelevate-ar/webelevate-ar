import { Suspense } from 'react';
import { EsqueletoFilas } from '@/components/ui/estados';
import { sesionActual } from '@/lib/sesion';
import { PantallaCatalogo } from './pantalla-catalogo';

export default async function PaginaCatalogo() {
  const sesion = await sesionActual();
  const puedeEditar = sesion?.rol === 'ADMIN' || sesion?.rol === 'SUPERVISOR';

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6">
          <EsqueletoFilas filas={8} />
        </div>
      }
    >
      <PantallaCatalogo puedeEditar={puedeEditar} />
    </Suspense>
  );
}
