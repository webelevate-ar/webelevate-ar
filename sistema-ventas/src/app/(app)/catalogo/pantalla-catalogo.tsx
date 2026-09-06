'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { EsqueletoFilas, EstadoError, EstadoVacio } from '@/components/ui/estados';
import { Insignia } from '@/components/ui/insignia';
import { aQueryString, useFiltrosUrl } from '@/hooks/use-filtros-url';
import { api, mensajeDeError } from '@/lib/cliente-api';
import { formatearCantidad, formatearMoneda, formatearPorcentaje } from '@/lib/formato';
import { calcularMargenCentesimas } from '@/lib/dinero';
import type { Unidad } from '@/lib/validacion/enums';
import { FormularioProducto, type ProductoDelListado } from './formulario-producto';

interface RespuestaCatalogo {
  total: number;
  productos: ProductoDelListado[];
  categorias: { id: string; nombre: string; color: string }[];
  proveedores: { id: string; nombre: string }[];
  porPagina: number;
}

const POR_DEFECTO = { texto: '', categoriaId: '', soloBajoMinimo: '', pagina: '1' };

export function PantallaCatalogo({ puedeEditar }: { puedeEditar: boolean }) {
  const clienteQuery = useQueryClient();
  const { valores, cambiar } = useFiltrosUrl(POR_DEFECTO);
  const [editando, setEditando] = useState<ProductoDelListado | 'nuevo' | null>(null);

  const consulta = aQueryString(valores);
  const catalogo = useQuery({
    queryKey: ['productos', consulta],
    queryFn: () => api.get<RespuestaCatalogo>(`/api/productos?${consulta}`),
  });

  const pagina = Number(valores.pagina) || 1;
  const paginas = Math.max(
    1,
    Math.ceil((catalogo.data?.total ?? 0) / (catalogo.data?.porPagina ?? 30)),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl text-texto">Catálogo</h1>
          <p className="mt-1 text-sm text-texto-suave">
            {catalogo.isSuccess ? `${catalogo.data.total} producto(s).` : 'Cargando…'}
          </p>
        </div>
        {puedeEditar ? (
          <Boton variante="acento" onClick={() => setEditando('nuevo')}>
            Producto nuevo
          </Boton>
        ) : null}
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Filtros">
        <Campo
          etiqueta="Buscar"
          value={valores.texto}
          onChange={(evento) => cambiar({ texto: evento.target.value })}
          placeholder="Nombre, código interno o código de barras"
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="categoria" className="text-sm text-texto-suave">
            Categoría
          </label>
          <select
            id="categoria"
            value={valores.categoriaId}
            onChange={(evento) => cambiar({ categoriaId: evento.target.value })}
            className="h-12 rounded-sm border border-borde-fuerte bg-superficie px-4 text-base text-texto focus:border-info focus:outline-none"
          >
            <option value="">Todas</option>
            {catalogo.data?.categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-3 pb-3 text-sm text-texto-suave">
          <input
            type="checkbox"
            checked={valores.soloBajoMinimo === 'true'}
            onChange={(evento) =>
              cambiar({ soloBajoMinimo: evento.target.checked ? 'true' : '' })
            }
            className="h-5 w-5 accent-acento"
          />
          Solo los que están bajo el mínimo
        </label>
      </section>

      {catalogo.isPending ? <EsqueletoFilas filas={8} /> : null}

      {catalogo.isError ? (
        <EstadoError
          mensaje={mensajeDeError(catalogo.error)}
          alReintentar={() => void catalogo.refetch()}
        />
      ) : null}

      {catalogo.isSuccess && catalogo.data.productos.length === 0 ? (
        <EstadoVacio
          titulo="No hay productos con esos filtros"
          descripcion="Probá con otro texto, otra categoría, o sacá el filtro de stock mínimo."
          accion={{ texto: 'Limpiar filtros', alPresionar: () => cambiar(POR_DEFECTO) }}
        />
      ) : null}

      {catalogo.isSuccess && catalogo.data.productos.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-md border border-borde">
            <table className="w-full min-w-2xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-borde bg-superficie-alta text-left text-texto-suave">
                  <th className="px-4 py-3 font-normal">Producto</th>
                  <th className="px-4 py-3 font-normal">Categoría</th>
                  <th className="px-4 py-3 text-right font-normal">Precio</th>
                  <th className="px-4 py-3 text-right font-normal">Margen</th>
                  <th className="px-4 py-3 text-right font-normal">Stock</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {catalogo.data.productos.map((producto) => {
                  const bajoMinimo = producto.stockMilesimas < producto.stockMinimoMilesimas;
                  return (
                    <tr
                      key={producto.id}
                      className="border-b border-borde bg-superficie last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        <p className="text-texto">{producto.nombre}</p>
                        <p className="mt-1 text-xs text-texto-tenue">
                          {producto.sku}
                          {producto.codigoBarras ? ` · ${producto.codigoBarras}` : ''}
                          {producto.activo ? '' : ' · dado de baja'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-texto-suave">{producto.categoria.nombre}</td>
                      <td className="px-4 py-3 text-right text-texto">
                        {formatearMoneda(producto.precioVentaCentavos)}
                      </td>
                      <td className="px-4 py-3 text-right text-texto-suave">
                        {formatearPorcentaje(
                          calcularMargenCentesimas(
                            producto.precioVentaCentavos,
                            producto.precioCostoCentavos,
                          ),
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={bajoMinimo ? 'text-advertencia' : 'text-texto-suave'}>
                          {bajoMinimo ? '▲ ' : ''}
                          {formatearCantidad(producto.stockMilesimas, producto.unidad as Unidad)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {puedeEditar ? (
                          <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(producto)}>
                            Editar
                          </Boton>
                        ) : (
                          <Insignia>solo lectura</Insignia>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav className="flex items-center justify-between" aria-label="Paginación">
            <Boton
              variante="contorno"
              disabled={pagina <= 1}
              onClick={() => cambiar({ pagina: String(pagina - 1) })}
            >
              Anterior
            </Boton>
            <span className="text-sm text-texto-suave">
              Página {pagina} de {paginas}
            </span>
            <Boton
              variante="contorno"
              disabled={pagina >= paginas}
              onClick={() => cambiar({ pagina: String(pagina + 1) })}
            >
              Siguiente
            </Boton>
          </nav>
        </>
      ) : null}

      {editando && catalogo.data ? (
        <FormularioProducto
          producto={editando === 'nuevo' ? null : editando}
          categorias={catalogo.data.categorias}
          proveedores={catalogo.data.proveedores}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            void clienteQuery.invalidateQueries({ queryKey: ['productos'] });
            void clienteQuery.invalidateQueries({ queryKey: ['catalogo'] });
          }}
        />
      ) : null}
    </div>
  );
}
