'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/cliente-api';
import { normalizarParaBuscar } from '@/lib/formato';

/**
 * El catálogo, en memoria.
 *
 * El presupuesto del §7.7 dice que la búsqueda tiene que responder en menos de
 * 100ms. No hay red que lo garantice por tecla, así que el catálogo entero se
 * trae una vez y se busca acá. Con 400 productos, filtrar es cuestión de
 * microsegundos.
 */

export interface ProductoDeCatalogo {
  id: string;
  sku: string;
  codigoBarras: string | null;
  nombre: string;
  nombreBusqueda: string;
  categoriaId: string;
  categoria: string;
  color: string;
  precioVentaCentavos: number;
  stockMilesimas: number;
  stockMinimoMilesimas: number;
  unidad: string;
}

export interface CategoriaDeCatalogo {
  id: string;
  nombre: string;
  color: string;
  orden: number;
}

interface RespuestaCatalogo {
  productos: ProductoDeCatalogo[];
  categorias: CategoriaDeCatalogo[];
}

export function useCatalogo() {
  return useQuery({
    queryKey: ['catalogo'],
    queryFn: () => api.get<RespuestaCatalogo>('/api/catalogo'),
    // El catálogo cambia cuando alguien edita un producto, no solo. Diez
    // minutos evita releerlo en cada venta sin dejarlo viejo todo el turno.
    staleTime: 10 * 60_000,
  });
}

const MAXIMO_RESULTADOS = 40;

/**
 * Busca por nombre, SKU y código de barras, sin acentos y sin distinguir
 * mayúsculas. Devuelve además la coincidencia exacta de código, que es la que
 * el lector espera que se agregue con `Enter` sin tener que elegir nada.
 */
export function buscarEnCatalogo(
  productos: readonly ProductoDeCatalogo[],
  texto: string,
): { resultados: ProductoDeCatalogo[]; exacto: ProductoDeCatalogo | null } {
  const limpio = texto.trim();
  if (limpio === '') return { resultados: [], exacto: null };

  const normalizado = normalizarParaBuscar(limpio);
  const resultados: ProductoDeCatalogo[] = [];
  let exacto: ProductoDeCatalogo | null = null;

  for (const producto of productos) {
    if (producto.codigoBarras === limpio || producto.sku.toLowerCase() === normalizado) {
      exacto = producto;
      resultados.unshift(producto);
      continue;
    }
    if (resultados.length >= MAXIMO_RESULTADOS) continue;
    if (
      producto.nombreBusqueda.includes(normalizado) ||
      producto.sku.toLowerCase().includes(normalizado) ||
      (producto.codigoBarras?.includes(limpio) ?? false)
    ) {
      resultados.push(producto);
    }
  }

  return { resultados: resultados.slice(0, MAXIMO_RESULTADOS), exacto };
}
