'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ErrorDeApi } from '@/lib/cliente-api';
import { normalizarParaBuscar } from '@/lib/formato';
import { CLAVE_CATALOGO, guardarEspejo, leerEspejo } from '@/lib/offline/almacen';

/**
 * El catálogo, en memoria y también en disco.
 *
 * El presupuesto del §7.7 dice que la búsqueda tiene que responder en menos de
 * 100ms. No hay red que lo garantice por tecla, así que el catálogo entero se
 * trae una vez y se busca acá. Con 400 productos, filtrar es cuestión de
 * microsegundos.
 *
 * Cada vez que se trae, además, se guarda una copia en IndexedDB. Esa copia es
 * lo que hace posible vender sin conexión: sin catálogo no hay ni buscador ni
 * precio, y el modo offline no sería más que un cartel.
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

interface EspejoCatalogo extends RespuestaCatalogo {
  guardadoEn: number;
}

export interface CatalogoEnUso extends RespuestaCatalogo {
  /**
   * Cuándo se guardó la copia, si lo que se está usando es la copia. `null`
   * significa que vino del servidor recién. La pantalla lo muestra: vender con
   * precios de hace seis horas sin saberlo no es modo offline, es un error.
   */
  espejoDe: number | null;
}

/**
 * Solo se cae al espejo cuando el servidor no contesta o contesta roto.
 *
 * Un 401 no entra acá a propósito. Si la sesión venció, servir el catálogo
 * guardado mostraría la pantalla de venta a alguien que ya no está logueado:
 * el respaldo es para la falta de red, no para saltear la autorización.
 */
function justificaEspejo(error: unknown): boolean {
  if (!(error instanceof ErrorDeApi)) return false;
  return error.status === 0 || error.status >= 500;
}

export function useCatalogo() {
  return useQuery<CatalogoEnUso>({
    queryKey: ['catalogo'],
    queryFn: async () => {
      try {
        const datos = await api.get<RespuestaCatalogo>('/api/catalogo');
        const espejo: EspejoCatalogo = { ...datos, guardadoEn: Date.now() };
        // Sin `await`: que la copia tarde no puede demorar la pantalla, y si
        // falla el guardado se sigue vendiendo igual — con conexión.
        void guardarEspejo(CLAVE_CATALOGO, espejo);
        return { ...datos, espejoDe: null };
      } catch (error) {
        if (!justificaEspejo(error)) throw error;
        const espejo = await leerEspejo<EspejoCatalogo>(CLAVE_CATALOGO);
        // Sin copia guardada no hay nada que mostrar, y el error original dice
        // mejor lo que pasa que un "catálogo vacío" que no explica nada.
        if (!espejo) throw error;
        return {
          productos: espejo.productos,
          categorias: espejo.categorias,
          espejoDe: espejo.guardadoEn,
        };
      }
    },
    // El catálogo cambia cuando alguien edita un producto, no solo. Diez
    // minutos evita releerlo en cada venta sin dejarlo viejo todo el turno.
    staleTime: 10 * 60_000,
    // El respaldo contra el espejo ya es el reintento útil. Insistir con la red
    // antes de usarlo solo demora la pantalla cuando no hay red.
    retry: false,
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
