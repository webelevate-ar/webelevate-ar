'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Aviso, EsqueletoFilas, EstadoError, EstadoVacio } from '@/components/ui/estados';
import { useCatalogo } from '@/hooks/use-catalogo';
import { api, mensajeDeError } from '@/lib/cliente-api';
import { parsearCantidadAMilesimas } from '@/lib/dinero';
import { formatearCantidad, formatearFechaHora, normalizarParaBuscar } from '@/lib/formato';
import {
  NOMBRE_TIPO_MOVIMIENTO_STOCK,
  type TipoMovimientoStock,
  type Unidad,
} from '@/lib/validacion/enums';

interface MovimientoDeStock {
  id: string;
  tipo: string;
  cantidadMilesimas: number;
  stockResultanteMilesimas: number;
  motivo: string | null;
  creadoEn: string;
  producto: { nombre: string; sku: string; unidad: string };
  usuario: { nombre: string };
}

interface AlertaDeStock {
  id: string;
  sku: string;
  nombre: string;
  unidad: string;
  stockMilesimas: number;
  stockMinimoMilesimas: number;
}

/**
 * Stock: alertas de mínimo y el registro de movimientos.
 *
 * Nada de acá edita el número de stock a mano. Todo entra como movimiento,
 * porque el stock del producto es un cache y la verdad es la suma del ledger
 * (§4). Si esta pantalla escribiera el número, la regla sería mentira.
 */
export function PantallaStock({ puedeMover }: { puedeMover: boolean }) {
  const clienteQuery = useQueryClient();
  const [moviendo, setMoviendo] = useState(false);

  const stock = useQuery({
    queryKey: ['stock'],
    queryFn: () =>
      api.get<{ movimientos: MovimientoDeStock[]; bajoMinimo: AlertaDeStock[] }>(
        '/api/stock/movimientos',
      ),
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl text-texto">Stock</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Ingresos, ajustes y mermas. Las ventas descuentan solas.
          </p>
        </div>
        {puedeMover ? (
          <Boton variante="acento" onClick={() => setMoviendo(true)}>
            Registrar movimiento
          </Boton>
        ) : null}
      </header>

      {stock.isPending ? <EsqueletoFilas filas={8} /> : null}

      {stock.isError ? (
        <EstadoError mensaje={mensajeDeError(stock.error)} alReintentar={() => void stock.refetch()} />
      ) : null}

      {stock.isSuccess ? (
        <>
          <section aria-label="Productos bajo el mínimo" className="flex flex-col gap-3">
            <h2 className="text-sm text-texto-suave">
              Bajo el mínimo ({stock.data.bajoMinimo.length})
            </h2>

            {stock.data.bajoMinimo.length === 0 ? (
              <Aviso tipo="exito">Ningún producto está por debajo de su stock mínimo.</Aviso>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {stock.data.bajoMinimo.map((alerta) => (
                  <li
                    key={alerta.id}
                    className="flex items-center justify-between gap-3 rounded-sm border border-advertencia bg-advertencia-fondo px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-texto">{alerta.nombre}</p>
                      <p className="mt-1 text-xs text-texto-suave">{alerta.sku}</p>
                    </div>
                    <p className="shrink-0 text-sm text-advertencia">
                      <span aria-hidden="true">▲ </span>
                      {formatearCantidad(alerta.stockMilesimas, alerta.unidad as Unidad)}
                      <span className="text-texto-tenue">
                        {' '}
                        / {formatearCantidad(alerta.stockMinimoMilesimas, alerta.unidad as Unidad)}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Movimientos de stock" className="flex flex-col gap-3">
            <h2 className="text-sm text-texto-suave">Últimos movimientos</h2>

            {stock.data.movimientos.length === 0 ? (
              <EstadoVacio
                titulo="Todavía no hay movimientos"
                descripcion="Cada ingreso de mercadería, ajuste, merma y venta va a aparecer acá con quién lo hizo."
              />
            ) : (
              <div className="overflow-x-auto rounded-md border border-borde">
                <table className="w-full min-w-2xl border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-borde bg-superficie-alta text-left text-texto-suave">
                      <th className="px-4 py-3 font-normal">Producto</th>
                      <th className="px-4 py-3 font-normal">Tipo</th>
                      <th className="px-4 py-3 text-right font-normal">Cantidad</th>
                      <th className="px-4 py-3 text-right font-normal">Queda</th>
                      <th className="px-4 py-3 font-normal">Quién</th>
                      <th className="px-4 py-3 font-normal">Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stock.data.movimientos.map((movimiento) => (
                      <tr
                        key={movimiento.id}
                        className="border-b border-borde bg-superficie last:border-b-0"
                      >
                        <td className="px-4 py-3">
                          <p className="text-texto">{movimiento.producto.nombre}</p>
                          {movimiento.motivo ? (
                            <p className="mt-1 text-xs text-texto-tenue">{movimiento.motivo}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-texto-suave">
                          {NOMBRE_TIPO_MOVIMIENTO_STOCK[movimiento.tipo as TipoMovimientoStock] ??
                            movimiento.tipo}
                        </td>
                        <td
                          className={
                            movimiento.cantidadMilesimas < 0
                              ? 'px-4 py-3 text-right text-advertencia'
                              : 'px-4 py-3 text-right text-exito'
                          }
                        >
                          {movimiento.cantidadMilesimas > 0 ? '+' : '−'}
                          {formatearCantidad(
                            Math.abs(movimiento.cantidadMilesimas),
                            movimiento.producto.unidad as Unidad,
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-texto-suave">
                          {formatearCantidad(
                            movimiento.stockResultanteMilesimas,
                            movimiento.producto.unidad as Unidad,
                          )}
                        </td>
                        <td className="px-4 py-3 text-texto-suave">{movimiento.usuario.nombre}</td>
                        <td className="px-4 py-3 text-texto-tenue">
                          {formatearFechaHora(new Date(movimiento.creadoEn))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <DialogoMovimientoStock
        abierto={moviendo}
        alCerrar={() => setMoviendo(false)}
        alHecho={() => {
          setMoviendo(false);
          void clienteQuery.invalidateQueries({ queryKey: ['stock'] });
          void clienteQuery.invalidateQueries({ queryKey: ['catalogo'] });
          void clienteQuery.invalidateQueries({ queryKey: ['productos'] });
        }}
      />
    </div>
  );
}

function DialogoMovimientoStock({
  abierto,
  alCerrar,
  alHecho,
}: {
  abierto: boolean;
  alCerrar: () => void;
  alHecho: () => void;
}) {
  const catalogo = useCatalogo();
  const [busqueda, setBusqueda] = useState('');
  const [productoId, setProductoId] = useState('');
  const [tipo, setTipo] = useState<'ingreso' | 'ajuste' | 'merma'>('ingreso');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const candidatos = useMemo(() => {
    const productos = catalogo.data?.productos ?? [];
    if (busqueda.trim() === '') return productos.slice(0, 20);
    const texto = normalizarParaBuscar(busqueda);
    return productos
      .filter(
        (producto) =>
          producto.nombreBusqueda.includes(texto) ||
          producto.sku.toLowerCase().includes(texto),
      )
      .slice(0, 20);
  }, [busqueda, catalogo.data]);

  const elegido = catalogo.data?.productos.find((producto) => producto.id === productoId);

  const movimiento = useMutation({
    mutationFn: (datos: {
      productoId: string;
      tipo: string;
      cantidadMilesimas: number;
      motivo: string;
    }) => api.post('/api/stock/movimientos', datos),
    onSuccess: () => {
      setCantidad('');
      setMotivo('');
      setError(null);
      alHecho();
    },
    onError: (fallo) => setError(mensajeDeError(fallo)),
  });

  return (
    <Dialogo
      abierto={abierto}
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo="Registrar movimiento de stock"
      descripcion="El stock no se edita a mano: entra por un movimiento, y queda quién lo hizo y por qué."
      ancho="md"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          setError(null);
          if (!elegido) {
            setError('Elegí un producto de la lista.');
            return;
          }
          const milesimas = parsearCantidadAMilesimas(cantidad);
          if (milesimas === null || milesimas === 0) {
            setError('Escribí una cantidad mayor a 0.');
            return;
          }
          if (motivo.trim().length < 3) {
            setError('Escribí el motivo, al menos 3 caracteres.');
            return;
          }
          // Merma siempre resta; ingreso siempre suma; el ajuste puede ir para
          // cualquier lado y por eso acepta el signo que escriban.
          const signo = tipo === 'merma' ? -1 : 1;
          movimiento.mutate({
            productoId: elegido.id,
            tipo,
            cantidadMilesimas: signo * milesimas,
            motivo,
          });
        }}
      >
        <Campo
          etiqueta="Producto"
          autoFocus
          value={busqueda}
          onChange={(evento) => {
            setBusqueda(evento.target.value);
            setProductoId('');
          }}
          placeholder="Nombre o código interno"
        />

        {!elegido ? (
          <ul className="max-h-48 overflow-y-auto rounded-sm border border-borde">
            {candidatos.map((producto) => (
              <li key={producto.id}>
                <button
                  type="button"
                  onClick={() => {
                    setProductoId(producto.id);
                    setBusqueda(producto.nombre);
                  }}
                  className="flex w-full items-center justify-between gap-3 border-b border-borde px-4 py-3 text-left text-sm last:border-b-0 hover:bg-superficie-alta"
                >
                  <span className="truncate text-texto">{producto.nombre}</span>
                  <span className="shrink-0 text-texto-tenue">
                    {formatearCantidad(producto.stockMilesimas, producto.unidad as Unidad)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="tipo-movimiento" className="text-sm text-texto-suave">
              Tipo
            </label>
            <select
              id="tipo-movimiento"
              value={tipo}
              onChange={(evento) =>
                setTipo(evento.target.value as 'ingreso' | 'ajuste' | 'merma')
              }
              className="h-12 rounded-sm border border-borde-fuerte bg-fondo px-4 text-base text-texto focus:border-info focus:outline-none"
            >
              <option value="ingreso">Ingreso de mercadería</option>
              <option value="ajuste">Ajuste</option>
              <option value="merma">Merma</option>
            </select>
          </div>

          <Campo
            etiqueta={`Cantidad${elegido ? (elegido.unidad === 'kg' ? ' (kg)' : ' (unidades)') : ''}`}
            inputMode="decimal"
            value={cantidad}
            onChange={(evento) => setCantidad(evento.target.value)}
          />
        </div>

        <Campo
          etiqueta="Motivo"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder={tipo === 'merma' ? 'Rotura y vencimiento' : 'Compra a proveedor'}
        />

        {error ? <Aviso tipo="error">{error}</Aviso> : null}

        <div className="flex gap-3">
          <Boton type="button" variante="fantasma" anchoCompleto onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="acento" anchoCompleto disabled={movimiento.isPending}>
            {movimiento.isPending ? 'Guardando…' : 'Registrar'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
