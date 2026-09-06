'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Aviso, EsqueletoFilas, EstadoError, EstadoVacio } from '@/components/ui/estados';
import { Insignia } from '@/components/ui/insignia';
import { aQueryString, useFiltrosUrl } from '@/hooks/use-filtros-url';
import { api, mensajeDeError } from '@/lib/cliente-api';
import { formatearFechaHora, formatearMoneda, formatearNumeroVenta } from '@/lib/formato';
import { NOMBRE_METODO_PAGO, type MetodoPago } from '@/lib/validacion/enums';

interface VentaDelHistorial {
  id: string;
  numero: number;
  totalCentavos: number;
  descuentoCentavos: number;
  estado: string;
  creadoEn: string;
  motivoAnulacion: string | null;
  usuario: { nombre: string };
  pagos: { id: string; metodo: string; montoCentavos: number }[];
  _count: { items: number };
}

const POR_DEFECTO = { estado: 'todas', texto: '', desde: '', hasta: '', pagina: '1' };

/**
 * Historial de ventas.
 *
 * Los filtros están en la URL, así que el enlace se puede compartir y la
 * recarga no pierde lo que se estaba mirando (§7.5).
 */
export function PantallaHistorial({ puedeAnular }: { puedeAnular: boolean }) {
  const clienteQuery = useQueryClient();
  const { valores, cambiar } = useFiltrosUrl(POR_DEFECTO);
  const [anulando, setAnulando] = useState<VentaDelHistorial | null>(null);

  const consulta = aQueryString(valores);
  const historial = useQuery({
    queryKey: ['ventas', consulta],
    queryFn: () =>
      api.get<{ total: number; ventas: VentaDelHistorial[]; porPagina: number }>(
        `/api/ventas?${consulta}`,
      ),
  });

  const pagina = Number(valores.pagina) || 1;
  const total = historial.data?.total ?? 0;
  const porPagina = historial.data?.porPagina ?? 25;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl text-texto">Historial de ventas</h1>
        <p className="mt-1 text-sm text-texto-suave">
          {historial.isSuccess ? `${total} venta(s) con estos filtros.` : 'Cargando…'}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Filtros">
        <Campo
          etiqueta="Número de venta"
          inputMode="numeric"
          value={valores.texto}
          onChange={(evento) => cambiar({ texto: evento.target.value.replace(/\D/g, '') })}
          placeholder="1234"
        />
        <Campo
          etiqueta="Desde"
          type="date"
          value={valores.desde}
          onChange={(evento) => cambiar({ desde: evento.target.value })}
        />
        <Campo
          etiqueta="Hasta"
          type="date"
          value={valores.hasta}
          onChange={(evento) => cambiar({ hasta: evento.target.value })}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="estado" className="text-sm text-texto-suave">
            Estado
          </label>
          <select
            id="estado"
            value={valores.estado}
            onChange={(evento) => cambiar({ estado: evento.target.value })}
            className="h-12 rounded-sm border border-borde-fuerte bg-superficie px-4 text-base text-texto focus:border-info focus:outline-none"
          >
            <option value="todas">Todas</option>
            <option value="completada">Completadas</option>
            <option value="anulada">Anuladas</option>
          </select>
        </div>
      </section>

      {historial.isPending ? <EsqueletoFilas filas={8} /> : null}

      {historial.isError ? (
        <EstadoError
          mensaje={mensajeDeError(historial.error)}
          alReintentar={() => void historial.refetch()}
        />
      ) : null}

      {historial.isSuccess && historial.data.ventas.length === 0 ? (
        <EstadoVacio
          titulo="No hay ventas con esos filtros"
          descripcion="Probá ampliando el rango de fechas o sacando el filtro de estado."
          accion={{ texto: 'Limpiar filtros', alPresionar: () => cambiar(POR_DEFECTO) }}
        />
      ) : null}

      {historial.isSuccess && historial.data.ventas.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-md border border-borde">
            <table className="w-full min-w-2xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-borde bg-superficie-alta text-left text-texto-suave">
                  <th className="px-4 py-3 font-normal">Venta</th>
                  <th className="px-4 py-3 font-normal">Fecha</th>
                  <th className="px-4 py-3 font-normal">Cajero</th>
                  <th className="px-4 py-3 font-normal">Ítems</th>
                  <th className="px-4 py-3 font-normal">Pago</th>
                  <th className="px-4 py-3 text-right font-normal">Total</th>
                  <th className="px-4 py-3 font-normal">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {historial.data.ventas.map((venta) => (
                  <tr key={venta.id} className="border-b border-borde bg-superficie last:border-b-0">
                    <td className="px-4 py-3 text-texto">{formatearNumeroVenta(venta.numero)}</td>
                    <td className="px-4 py-3 text-texto-suave">
                      {formatearFechaHora(new Date(venta.creadoEn))}
                    </td>
                    <td className="px-4 py-3 text-texto-suave">{venta.usuario.nombre}</td>
                    <td className="px-4 py-3 text-texto-suave">{venta._count.items}</td>
                    <td className="px-4 py-3 text-texto-suave">
                      {venta.pagos
                        .map((pago) => NOMBRE_METODO_PAGO[pago.metodo as MetodoPago] ?? pago.metodo)
                        .join(' + ')}
                    </td>
                    <td className="px-4 py-3 text-right text-texto">
                      {formatearMoneda(venta.totalCentavos)}
                    </td>
                    <td className="px-4 py-3">
                      {venta.estado === 'anulada' ? (
                        <Insignia tono="error">Anulada</Insignia>
                      ) : (
                        <Insignia tono="exito">Completada</Insignia>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Boton comoHijo tamano="sm" variante="fantasma">
                          <a href={`/ticket/${venta.numero}`} target="_blank" rel="noreferrer">
                            Ticket
                          </a>
                        </Boton>
                        {puedeAnular && venta.estado === 'completada' ? (
                          <Boton tamano="sm" variante="fantasma" onClick={() => setAnulando(venta)}>
                            Anular
                          </Boton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
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

      <DialogoAnulacion
        venta={anulando}
        alCerrar={() => setAnulando(null)}
        alHecho={() => {
          setAnulando(null);
          void clienteQuery.invalidateQueries({ queryKey: ['ventas'] });
          void clienteQuery.invalidateQueries({ queryKey: ['catalogo'] });
          void clienteQuery.invalidateQueries({ queryKey: ['caja'] });
        }}
      />
    </div>
  );
}

function DialogoAnulacion({
  venta,
  alCerrar,
  alHecho,
}: {
  venta: VentaDelHistorial | null;
  alCerrar: () => void;
  alHecho: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const anulacion = useMutation({
    mutationFn: (datos: { id: string; motivo: string }) =>
      api.post(`/api/ventas/${datos.id}/anular`, { motivo: datos.motivo }),
    onSuccess: () => {
      setMotivo('');
      setError(null);
      alHecho();
    },
    onError: (fallo) => setError(mensajeDeError(fallo)),
  });

  return (
    <Dialogo
      abierto={venta !== null}
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo={venta ? `Anular la venta ${formatearNumeroVenta(venta.numero)}` : 'Anular venta'}
      descripcion="La venta no se borra: queda marcada como anulada y se generan los movimientos inversos de stock y de caja."
      ancho="sm"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          setError(null);
          if (motivo.trim().length < 5) {
            setError('Escribí el motivo de la anulación, al menos 5 caracteres.');
            return;
          }
          if (venta) anulacion.mutate({ id: venta.id, motivo });
        }}
      >
        <Campo
          etiqueta="Motivo"
          autoFocus
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder="El cliente devolvió la mercadería"
        />

        {error ? <Aviso tipo="error">{error}</Aviso> : null}

        <div className="flex gap-3">
          <Boton type="button" variante="fantasma" anchoCompleto onClick={alCerrar}>
            Volver
          </Boton>
          <Boton type="submit" variante="peligro" anchoCompleto disabled={anulacion.isPending}>
            {anulacion.isPending ? 'Anulando…' : 'Anular la venta'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
