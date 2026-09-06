'use client';

import { forwardRef } from 'react';
import type { ProductoDeCatalogo } from '@/hooks/use-catalogo';
import { formatearCantidad, formatearMoneda } from '@/lib/formato';
import { cn } from '@/lib/utils';

/**
 * Buscador de productos.
 *
 * El lector de códigos es un teclado: escribe el código y manda `Enter`. Por
 * eso no hay integración con el lector, y por eso este campo tiene que estar
 * enfocado siempre. Toda la pantalla de venta devuelve el foco acá.
 */
export const BuscadorProductos = forwardRef<
  HTMLInputElement,
  {
    texto: string;
    alCambiar: (texto: string) => void;
    alConfirmar: () => void;
    resultados: readonly ProductoDeCatalogo[];
    alElegir: (producto: ProductoDeCatalogo) => void;
    aviso: string | null;
  }
>(function BuscadorProductos(
  { texto, alCambiar, alConfirmar, resultados, alElegir, aviso },
  ref,
) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <label htmlFor="buscador" className="sr-only">
        Buscar producto por nombre, código interno o código de barras
      </label>
      <input
        ref={ref}
        id="buscador"
        type="text"
        value={texto}
        autoComplete="off"
        spellCheck={false}
        placeholder="Escaneá un código o escribí el nombre"
        onChange={(evento) => alCambiar(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault();
            alConfirmar();
          }
        }}
        className={cn(
          'h-16 w-full rounded-sm border bg-superficie px-4 text-lg text-texto',
          'placeholder:text-texto-tenue outline-none transition-colors duration-100',
          aviso ? 'border-error' : 'border-borde-fuerte focus:border-info',
        )}
      />

      {aviso ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-error">
          <span aria-hidden="true">✕</span>
          {aviso}
        </p>
      ) : null}

      {resultados.length > 0 ? (
        <ul
          aria-label="Resultados de la búsqueda"
          className="max-h-64 overflow-y-auto rounded-sm border border-borde bg-superficie"
        >
          {resultados.map((producto, indice) => (
            <li key={producto.id}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => alElegir(producto)}
                className={cn(
                  'flex w-full items-center justify-between gap-4 border-b border-borde px-4 py-3 text-left',
                  'transition-colors duration-100 last:border-b-0 hover:bg-superficie-alta',
                  indice === 0 && 'bg-superficie-alta',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base text-texto">{producto.nombre}</span>
                  <span className="mt-1 block text-xs text-texto-tenue">
                    {producto.sku}
                    {producto.codigoBarras ? ` · ${producto.codigoBarras}` : ''} ·{' '}
                    {producto.categoria}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base text-texto">
                    {formatearMoneda(producto.precioVentaCentavos)}
                    {producto.unidad === 'kg' ? (
                      <span className="text-xs text-texto-tenue"> /kg</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'mt-1 block text-xs',
                      producto.stockMilesimas <= 0 ? 'text-advertencia' : 'text-texto-tenue',
                    )}
                  >
                    {producto.stockMilesimas <= 0 ? '▲ sin stock' : null}
                    {producto.stockMilesimas > 0
                      ? formatearCantidad(
                          producto.stockMilesimas,
                          producto.unidad === 'kg' ? 'kg' : 'unidad',
                        )
                      : null}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
