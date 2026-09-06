'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Filtros, paginación y búsquedas viven en la query string (§7.5).
 *
 * Es lo que permite mandarle a alguien el enlace de "las ventas anuladas de
 * ayer" en vez de explicarle qué botones apretar, y que recargar la página no
 * pierda lo que se estaba mirando.
 */
export function useFiltrosUrl<T extends Record<string, string>>(porDefecto: T) {
  const router = useRouter();
  const ruta = usePathname();
  const parametros = useSearchParams();

  const valores = useMemo(() => {
    const resultado = { ...porDefecto };
    for (const clave of Object.keys(porDefecto)) {
      const valor = parametros.get(clave);
      if (valor !== null) resultado[clave as keyof T] = valor as T[keyof T];
    }
    return resultado;
    // `porDefecto` es un literal nuevo en cada render; lo que importa es la URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametros]);

  const cambiar = useCallback(
    (cambios: Partial<Record<keyof T, string>>) => {
      const siguientes = new URLSearchParams(parametros.toString());
      for (const [clave, valor] of Object.entries(cambios)) {
        if (valor === undefined || valor === '' || valor === porDefecto[clave as keyof T]) {
          siguientes.delete(clave);
        } else {
          siguientes.set(clave, valor);
        }
      }
      // Cambiar un filtro vuelve a la primera página: si no, el listado queda
      // en la página 7 de un resultado que ahora tiene dos.
      if (!('pagina' in cambios)) siguientes.delete('pagina');

      const consulta = siguientes.toString();
      router.replace(consulta ? `${ruta}?${consulta}` : ruta, { scroll: false });
    },
    [parametros, porDefecto, router, ruta],
  );

  return { valores, cambiar };
}

export function aQueryString(valores: Record<string, string>): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== '') parametros.set(clave, valor);
  }
  return parametros.toString();
}
