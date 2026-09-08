'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

/**
 * Estado de servidor con TanStack Query (§7.5). No hay un solo `useEffect` con
 * `fetch` en el proyecto: eso duplica peticiones, no cachea y deja carreras
 * cuando el usuario cambia de pantalla antes de que responda.
 */
export function Providers({ children }: { children: ReactNode }) {
  // El cliente se crea dentro del componente: uno global se compartiría entre
  // peticiones en el servidor y filtraría datos de un usuario a otro.
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // El mostrador no cambia de datos cada segundo, y refrescar al
            // volver a la pestaña interrumpe una venta en curso.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
            /*
             * ⚠️ Esto es lo que hace posible el modo offline, y cuesta
             * encontrarlo: por defecto TanStack Query **pausa** toda consulta
             * cuando `navigator.onLine` da falso. La consulta no falla, no
             * reintenta y no llama a su `queryFn`: queda esperando en silencio.
             *
             * Con eso puesto, el respaldo contra el espejo del catálogo nunca
             * se ejecutaría —el código que lee IndexedDB vive dentro del
             * `queryFn`— y la pantalla de venta se quedaría en el esqueleto
             * para siempre justo cuando se corta internet, que es el único
             * momento en que el modo offline tiene sentido.
             *
             * Y hay una razón más: `navigator.onLine` miente. Ver el
             * encabezado de `lib/offline/conexion.ts`.
             */
            networkMode: 'always',
          },
          mutations: { networkMode: 'always' },
        },
      }),
  );

  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
