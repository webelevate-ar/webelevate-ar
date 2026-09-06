'use client';

import { formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import type { CategoriaDeCatalogo, ProductoDeCatalogo } from '@/hooks/use-catalogo';

/**
 * Grilla de botones grandes, con color por categoría.
 *
 * Es para lo que no tiene código de barras: pan, verdura, fiambre, todo lo que
 * se fracciona. Sin esto, esos productos habría que buscarlos escribiendo, que
 * es justo lo que hace lenta una venta de verdulería.
 */
export function GrillaProductos({
  productos,
  categorias,
  categoriaActiva,
  alCambiarCategoria,
  alElegir,
}: {
  productos: readonly ProductoDeCatalogo[];
  categorias: readonly CategoriaDeCatalogo[];
  categoriaActiva: string | null;
  alCambiarCategoria: (categoriaId: string | null) => void;
  alElegir: (producto: ProductoDeCatalogo) => void;
}) {
  const visibles = categoriaActiva
    ? productos.filter((producto) => producto.categoriaId === categoriaActiva)
    : productos.filter((producto) => producto.codigoBarras === null);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap gap-2" role="tablist" aria-label="Categorías">
        <BotonCategoria
          activo={categoriaActiva === null}
          color="#63768a"
          onClick={() => alCambiarCategoria(null)}
        >
          Sin código
        </BotonCategoria>
        {categorias.map((categoria) => (
          <BotonCategoria
            key={categoria.id}
            activo={categoriaActiva === categoria.id}
            color={categoria.color}
            onClick={() => alCambiarCategoria(categoria.id)}
          >
            {categoria.nombre}
          </BotonCategoria>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-texto-tenue">
          No hay productos en esta categoría.
        </p>
      ) : (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-3 gap-2 overflow-y-auto pr-1 xl:grid-cols-4">
          {visibles.map((producto) => (
            <li key={producto.id}>
              <button
                type="button"
                onClick={() => alElegir(producto)}
                // `tabIndex -1`: el recorrido con Tab tiene que llevar del
                // buscador al carrito, no pasar por cuatrocientos botones.
                tabIndex={-1}
                style={{ borderColor: producto.color }}
                className={cn(
                  'flex h-24 w-full flex-col justify-between rounded-sm border-l-4 border-y border-r border-y-borde border-r-borde',
                  'bg-superficie p-2 text-left transition-colors duration-100 hover:bg-superficie-alta',
                )}
              >
                <span className="line-clamp-2 text-xs text-texto">{producto.nombre}</span>
                <span className="text-sm text-texto-suave">
                  {formatearMoneda(producto.precioVentaCentavos)}
                  {producto.unidad === 'kg' ? (
                    <span className="text-xs text-texto-tenue"> /kg</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BotonCategoria({
  activo,
  color,
  onClick,
  children,
}: {
  activo: boolean;
  color: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-sm border px-3 text-sm transition-colors duration-100',
        activo
          ? 'border-borde-fuerte bg-superficie-alta text-texto'
          : 'border-borde text-texto-suave hover:text-texto',
      )}
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: color }}
        className="h-3 w-3 rounded-full"
      />
      {children}
    </button>
  );
}
