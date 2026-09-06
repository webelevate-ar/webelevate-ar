'use client';

import { useEffect, useRef } from 'react';
import { Boton } from '@/components/ui/boton';
import { formatearCantidad, formatearMoneda, formatearPorcentaje } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { subtotalDeItem, type ItemCarrito, type TotalesCarrito } from '@/store/carrito';

/**
 * El carrito. Ocupa el 40% derecho de la pantalla de venta.
 *
 * El total va en 48px porque es lo único que el cajero mira todo el día, y en
 * `aria-live` para que también se anuncie cuando cambia (§7.8).
 */
export function CarritoVenta({
  items,
  totales,
  indiceSeleccionado,
  descuentoPorcentajeCentesimas,
  alSeleccionar,
  alQuitar,
  alCambiarCantidad,
  alCobrar,
}: {
  items: readonly ItemCarrito[];
  totales: TotalesCarrito;
  indiceSeleccionado: number;
  descuentoPorcentajeCentesimas: number;
  alSeleccionar: (indice: number) => void;
  alQuitar: (indice: number) => void;
  alCambiarCantidad: (indice: number, delta: number) => void;
  alCobrar: () => void;
}) {
  const listaRef = useRef<HTMLUListElement>(null);

  // Con quince ítems el seleccionado se va abajo del borde y las flechas dejan
  // de servir: se lo trae a la vista en cada cambio de selección.
  useEffect(() => {
    const fila = listaRef.current?.children[indiceSeleccionado];
    if (fila instanceof HTMLElement) fila.scrollIntoView({ block: 'nearest' });
  }, [indiceSeleccionado]);

  return (
    <section
      aria-label="Carrito"
      className="flex h-full flex-col border-l border-borde bg-superficie"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-borde px-4">
        <h2 className="text-sm text-texto-suave">Carrito</h2>
        <span className="text-sm text-texto-tenue">
          {items.length === 0
            ? 'vacío'
            : `${items.length} ${items.length === 1 ? 'ítem' : 'ítems'}`}
        </span>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-base text-texto-suave">El carrito está vacío.</p>
          <p className="text-sm text-texto-tenue">
            Escaneá un producto o escribí su nombre en el buscador.
          </p>
        </div>
      ) : (
        <ul ref={listaRef} className="flex-1 overflow-y-auto">
          {items.map((item, indice) => {
            const seleccionado = indice === indiceSeleccionado;
            const sinStock = item.stockMilesimas < item.cantidadMilesimas;

            return (
              <li
                key={item.productoId}
                aria-current={seleccionado ? 'true' : undefined}
                className={cn(
                  'border-b border-borde px-4 py-3 transition-colors duration-100',
                  seleccionado ? 'bg-superficie-alta' : 'hover:bg-superficie-alta',
                )}
                onClick={() => alSeleccionar(indice)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-texto">{item.nombre}</p>
                    <p className="mt-1 text-xs text-texto-tenue">
                      {formatearMoneda(item.precioUnitarioCentavos)}
                      {item.unidad === 'kg' ? ' por kg' : ' c/u'}
                    </p>
                  </div>
                  <p className="shrink-0 text-lg text-texto">{formatearMoneda(subtotalDeItem(item))}</p>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <Boton
                    tamano="sm"
                    variante="contorno"
                    aria-label={`Restar cantidad de ${item.nombre}`}
                    onClick={(evento) => {
                      evento.stopPropagation();
                      alCambiarCantidad(indice, -1);
                    }}
                  >
                    −
                  </Boton>
                  <span className="min-w-24 text-center text-base text-texto">
                    {formatearCantidad(item.cantidadMilesimas, item.unidad)}
                  </span>
                  <Boton
                    tamano="sm"
                    variante="contorno"
                    aria-label={`Sumar cantidad de ${item.nombre}`}
                    onClick={(evento) => {
                      evento.stopPropagation();
                      alCambiarCantidad(indice, 1);
                    }}
                  >
                    +
                  </Boton>
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    className="ml-auto"
                    aria-label={`Quitar ${item.nombre}`}
                    onClick={(evento) => {
                      evento.stopPropagation();
                      alQuitar(indice);
                    }}
                  >
                    Quitar
                  </Boton>
                </div>

                {sinStock ? (
                  // Amarillo y triángulo: nada se comunica solo por color (§7.8).
                  <p className="mt-2 flex items-center gap-2 text-xs text-advertencia">
                    <span aria-hidden="true">▲</span>
                    Sin stock en el sistema. Se vende igual.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <footer className="shrink-0 border-t border-borde p-4">
        <dl className="mb-3 flex flex-col gap-1 text-sm">
          <div className="flex justify-between text-texto-suave">
            <dt>Subtotal</dt>
            <dd>{formatearMoneda(totales.subtotalCentavos)}</dd>
          </div>
          {totales.descuentoCentavos > 0 ? (
            <div className="flex justify-between text-advertencia">
              <dt>Descuento {formatearPorcentaje(descuentoPorcentajeCentesimas)}</dt>
              <dd>−{formatearMoneda(totales.descuentoCentavos)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-sm text-texto-suave">Total</span>
          <output aria-live="polite" className="text-3xl text-texto">
            {formatearMoneda(totales.totalCentavos)}
          </output>
        </div>

        <Boton
          variante="acento"
          tamano="xl"
          anchoCompleto
          disabled={items.length === 0}
          onClick={alCobrar}
        >
          Cobrar · F2
        </Boton>
      </footer>
    </section>
  );
}
