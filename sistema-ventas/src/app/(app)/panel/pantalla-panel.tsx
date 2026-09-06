'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  GraficoBarras,
  GraficoColumnas,
  TarjetaGrafico,
  type PuntoDeGrafico,
} from '@/components/pos/graficos';
import { EsqueletoFilas, EstadoError } from '@/components/ui/estados';
import { Insignia } from '@/components/ui/insignia';
import { api, mensajeDeError } from '@/lib/cliente-api';
import {
  formatearCantidad,
  formatearFechaHora,
  formatearMoneda,
  formatearMonedaRedonda,
  formatearPorcentaje,
} from '@/lib/formato';
import { NOMBRE_ACCION } from '@/lib/acciones';
import { NOMBRE_METODO_PAGO, type MetodoPago, type Unidad } from '@/lib/validacion/enums';

interface ResumenPanel {
  hoy: { ventas: number; totalCentavos: number; ticketPromedioCentavos: number };
  ayer: { ventas: number; totalCentavos: number; ticketPromedioCentavos: number };
  variacionCentesimas: number | null;
  margenCentesimas: number;
  porDia: { dia: string; ventas: number; totalCentavos: number }[];
  porHora: { hora: number; ventas: number; totalCentavos: number }[];
  porMetodo: { metodo: string; totalCentavos: number; cantidad: number }[];
  ranking: {
    productoId: string;
    nombre: string;
    unidad: string;
    cantidadMilesimas: number;
    totalCentavos: number;
  }[];
  productosBajoMinimo: number;
}

interface EntradaAuditoria {
  id: string;
  accion: string;
  entidad: string;
  creadoEn: string;
  datosDespues: string | null;
  usuario: { nombre: string; rol: string };
}

/**
 * Panel del dueño.
 *
 * Esta pantalla y el registro de auditoría son lo que cierra la venta del
 * sistema: el cajero compra la velocidad, el dueño compra saber qué pasó con
 * la plata y quién tocó qué.
 */
export function PantallaPanel() {
  const panel = useQuery({
    queryKey: ['panel'],
    queryFn: () => api.get<ResumenPanel>('/api/panel'),
  });

  const auditoria = useQuery({
    queryKey: ['auditoria'],
    queryFn: () => api.get<{ entradas: EntradaAuditoria[] }>('/api/auditoria'),
  });

  const porDia = useMemo<PuntoDeGrafico[]>(
    () =>
      (panel.data?.porDia ?? []).map((fila) => {
        const [, mes = '', dia = ''] = fila.dia.split('-');
        return {
          clave: fila.dia,
          etiqueta: `${dia}/${mes}`,
          valor: fila.totalCentavos,
          valorTexto: formatearMonedaRedonda(fila.totalCentavos),
        };
      }),
    [panel.data],
  );

  const porHora = useMemo<PuntoDeGrafico[]>(
    () =>
      (panel.data?.porHora ?? []).map((fila) => ({
        clave: String(fila.hora),
        etiqueta: `${String(fila.hora).padStart(2, '0')}h`,
        valor: fila.ventas,
        valorTexto: `${fila.ventas} ventas`,
      })),
    [panel.data],
  );

  const ranking = useMemo<PuntoDeGrafico[]>(
    () =>
      (panel.data?.ranking ?? []).map((fila) => ({
        clave: fila.productoId,
        etiqueta: fila.nombre,
        valor: fila.totalCentavos,
        valorTexto: `${formatearMonedaRedonda(fila.totalCentavos)} · ${formatearCantidad(
          fila.cantidadMilesimas,
          fila.unidad as Unidad,
        )}`,
      })),
    [panel.data],
  );

  const porMetodo = useMemo<PuntoDeGrafico[]>(
    () =>
      (panel.data?.porMetodo ?? []).map((fila) => ({
        clave: fila.metodo,
        etiqueta: NOMBRE_METODO_PAGO[fila.metodo as MetodoPago] ?? fila.metodo,
        valor: fila.totalCentavos,
        valorTexto: formatearMonedaRedonda(fila.totalCentavos),
      })),
    [panel.data],
  );

  if (panel.isPending) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <EsqueletoFilas filas={10} />
      </div>
    );
  }

  if (panel.isError) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <EstadoError mensaje={mensajeDeError(panel.error)} alReintentar={() => void panel.refetch()} />
      </div>
    );
  }

  const datos = panel.data;
  const variacion = datos.variacionCentesimas;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl text-texto">Panel</h1>
        <p className="mt-1 text-sm text-texto-suave">Los últimos 30 días.</p>
      </header>

      {/* La cifra que lidera la pantalla: una sola por vista. */}
      <section
        className="flex flex-wrap items-end justify-between gap-6 rounded-md border border-borde bg-superficie p-6"
        aria-label="Ventas de hoy"
      >
        <div>
          <p className="text-sm text-texto-suave">Vendido hoy</p>
          <p className="cifra-destacada mt-2 text-3xl text-texto">
            {formatearMoneda(datos.hoy.totalCentavos)}
          </p>
          <p className="mt-2 text-sm text-texto-tenue">
            {variacion === null
              ? 'Ayer no hubo ventas para comparar.'
              : `${variacion >= 0 ? '+' : '−'}${formatearPorcentaje(Math.abs(variacion))} contra ayer (${formatearMoneda(datos.ayer.totalCentavos)}).`}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
          <Dato titulo="Ventas hoy" valor={String(datos.hoy.ventas)} />
          <Dato titulo="Ticket promedio" valor={formatearMoneda(datos.hoy.ticketPromedioCentavos)} />
          <Dato titulo="Margen 30 días" valor={formatearPorcentaje(datos.margenCentesimas)} />
          <Dato
            titulo="Bajo el mínimo"
            valor={String(datos.productosBajoMinimo)}
            alerta={datos.productosBajoMinimo > 0}
          />
        </dl>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <TarjetaGrafico
            titulo="Vendido por día"
            descripcion="Total cobrado cada día, sin las ventas anuladas."
            datos={porDia}
            columnaEtiqueta="Día"
            columnaValor="Vendido"
          >
            <GraficoColumnas datos={porDia} etiquetaCadaN={3} />
          </TarjetaGrafico>
        </div>

        <TarjetaGrafico
          titulo="Ventas por hora"
          descripcion="Cuándo se llena el local. Sirve para decidir turnos."
          datos={porHora}
          columnaEtiqueta="Hora"
          columnaValor="Ventas"
        >
          <GraficoColumnas datos={porHora} />
        </TarjetaGrafico>

        <TarjetaGrafico
          titulo="Cómo pagan"
          descripcion="Total cobrado por método, neto de vuelto."
          datos={porMetodo}
          columnaEtiqueta="Método"
          columnaValor="Cobrado"
        >
          <GraficoBarras datos={porMetodo} />
        </TarjetaGrafico>

        <div className="lg:col-span-2">
          <TarjetaGrafico
            titulo="Los diez que más facturan"
            descripcion="Por importe vendido en los últimos 30 días."
            datos={ranking}
            columnaEtiqueta="Producto"
            columnaValor="Vendido"
          >
            <GraficoBarras datos={ranking} />
          </TarjetaGrafico>
        </div>
      </div>

      <section aria-label="Registro de auditoría" className="flex flex-col gap-3">
        <div>
          <h2 className="text-base text-texto">Registro de auditoría</h2>
          <p className="mt-1 text-xs text-texto-tenue">
            Anulaciones, descuentos, retiros, ajustes de stock, cambios de precio y cierres con
            diferencia. Queda quién, cuándo y qué cambió.
          </p>
        </div>

        {auditoria.isPending ? <EsqueletoFilas filas={5} /> : null}

        {auditoria.isError ? (
          <EstadoError
            mensaje={mensajeDeError(auditoria.error)}
            alReintentar={() => void auditoria.refetch()}
          />
        ) : null}

        {auditoria.data ? (
          <div className="max-h-96 overflow-y-auto rounded-md border border-borde">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-superficie-alta">
                <tr className="border-b border-borde text-left text-texto-suave">
                  <th className="px-4 py-3 font-normal">Acción</th>
                  <th className="px-4 py-3 font-normal">Quién</th>
                  <th className="px-4 py-3 font-normal">Cuándo</th>
                  <th className="px-4 py-3 font-normal">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {auditoria.data.entradas.map((entrada) => (
                  <tr key={entrada.id} className="border-b border-borde bg-superficie last:border-b-0">
                    <td className="px-4 py-3 text-texto">
                      {NOMBRE_ACCION[entrada.accion] ?? entrada.accion}
                    </td>
                    <td className="px-4 py-3 text-texto-suave">{entrada.usuario.nombre}</td>
                    <td className="px-4 py-3 text-texto-tenue">
                      {formatearFechaHora(new Date(entrada.creadoEn))}
                    </td>
                    <td className="px-4 py-3 text-texto-tenue">
                      <DetalleAuditoria json={entrada.datosDespues} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-texto-tenue">{titulo}</dt>
      <dd className="mt-1 flex items-center gap-2 text-lg text-texto">
        {valor}
        {alerta ? <Insignia tono="advertencia">▲ reponer</Insignia> : null}
      </dd>
    </div>
  );
}

/**
 * El detalle se guarda como JSON para no atarse a una forma por acción. Acá se
 * muestra en lenguaje llano; si aparece una clave que no se reconoce, se
 * muestra igual en vez de tragarse el dato.
 */
function DetalleAuditoria({ json }: { json: string | null }) {
  if (!json) return <span>—</span>;

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return <span>—</span>;
  }

  const partes = Object.entries(datos).map(([clave, valor]) => {
    if (clave.endsWith('Centavos') && typeof valor === 'number') {
      return `${etiquetaDeClave(clave)} ${formatearMoneda(valor)}`;
    }
    return `${etiquetaDeClave(clave)} ${String(valor)}`;
  });

  return <span>{partes.join(' · ')}</span>;
}

function etiquetaDeClave(clave: string): string {
  const legible = clave
    .replace(/Centavos$/, '')
    .replace(/Milesimas$/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
  return `${legible.charAt(0).toUpperCase()}${legible.slice(1)}:`;
}
