'use client';

import { useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Dialogo } from '@/components/ui/dialogo';
import { Aviso, EsqueletoFilas, EstadoVacio } from '@/components/ui/estados';
import { Insignia } from '@/components/ui/insignia';
import { useCola } from '@/hooks/use-cola';
import { useConexion } from '@/hooks/use-conexion';
import { MAXIMO_INTENTOS, type VentaPendiente } from '@/lib/offline/cola';
import { comprobarConexion } from '@/lib/offline/conexion';
import { formatearCantidad, formatearFechaHora, formatearMoneda } from '@/lib/formato';
import { NOMBRE_METODO_PAGO, type MetodoPago, type Rol } from '@/lib/validacion/enums';

/**
 * Las ventas cobradas que todavía no están en el servidor.
 *
 * Es la pantalla que existe para que **nada se pierda en silencio**. Cada línea
 * de acá es plata que ya está en el cajón: mientras siga en esta lista, no
 * figura en el historial, no descontó stock y no entra en el arqueo.
 *
 * Por eso no hay ningún camino automático que borre una venta. Se van solas
 * cuando entran al servidor; las que el servidor rechaza se quedan, en rojo,
 * con el motivo escrito, hasta que una persona decida qué hacer.
 */
export function PantallaPendientes({ usuarioId, rol }: { usuarioId: string; rol: Rol }) {
  const enLinea = useConexion();
  const { consulta, pendientes, resumen, sinAlmacen, sincronizar, reintentarUna, descartarUna } =
    useCola(usuarioId);
  const [aDescartar, setADescartar] = useState<VentaPendiente | null>(null);

  const supervisa = rol === 'ADMIN' || rol === 'SUPERVISOR';

  if (consulta.isPending) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <EsqueletoFilas filas={4} />
      </div>
    );
  }

  if (sinAlmacen) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Aviso tipo="error">
          No se pudo leer el almacén local de esta PC, así que no se sabe si hay ventas sin
          sincronizar. No es lo mismo que no haya ninguna. Suele pasar en una ventana de incógnito
          o con el almacenamiento del sitio bloqueado: probá en una ventana normal.
        </Aviso>
      </div>
    );
  }

  const lista = pendientes ?? [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl text-texto">Ventas sin sincronizar</h1>
          <p className="mt-1 max-w-2xl text-sm text-texto-suave">
            Cobradas en esta PC sin conexión. Hasta que entren al servidor no están en el
            historial, no descontaron stock y no cuentan para el arqueo.
          </p>
        </div>
        <div className="flex gap-3">
          <Boton
            variante="contorno"
            onClick={() => void comprobarConexion()}
            disabled={sincronizar.isPending}
          >
            Comprobar conexión
          </Boton>
          <Boton
            variante="acento"
            onClick={() => sincronizar.mutate()}
            disabled={sincronizar.isPending || resumen.enCola === 0}
          >
            {sincronizar.isPending ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Boton>
        </div>
      </header>

      {!enLinea ? (
        <Aviso tipo="advertencia">
          Sin conexión con el servidor. Las ventas se mandan solas cuando vuelva; no hace falta
          quedarse en esta pantalla.
        </Aviso>
      ) : null}

      {resumen.deOtroUsuario > 0 ? (
        <Aviso tipo="info">
          Hay {resumen.deOtroUsuario} venta(s) cobradas por otra persona en esta misma PC. Se
          sincronizan cuando esa persona vuelva a ingresar: una venta tiene que entrar en la caja
          de quien la cobró.
        </Aviso>
      ) : null}

      {sincronizar.data && !sincronizar.isPending ? (
        <Aviso tipo={sincronizar.data.rechazadas > 0 ? 'advertencia' : 'exito'}>
          {sincronizar.data.enviadas} entraron
          {sincronizar.data.yaExistian > 0
            ? `, ${sincronizar.data.yaExistian} ya estaban en el servidor`
            : ''}
          {sincronizar.data.rechazadas > 0
            ? `, ${sincronizar.data.rechazadas} rechazadas`
            : ''}
          . Quedan {sincronizar.data.restantes}.
        </Aviso>
      ) : null}

      {lista.length === 0 ? (
        <EstadoVacio
          titulo="No hay ventas sin sincronizar"
          descripcion="Todo lo que se cobró en esta PC ya está en el servidor."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {lista
            .slice()
            .sort((una, otra) => otra.cobradaEn - una.cobradaEn)
            .map((venta) => (
              <Fila
                key={venta.claveIdempotencia}
                venta={venta}
                esMia={venta.usuarioId === usuarioId}
                puedeDescartar={supervisa}
                ocupado={reintentarUna.isPending || descartarUna.isPending}
                alReintentar={() => reintentarUna.mutate(venta)}
                alDescartar={() => setADescartar(venta)}
              />
            ))}
        </ul>
      )}

      <Dialogo
        abierto={aDescartar !== null}
        alCambiar={(estado) => {
          if (!estado) setADescartar(null);
        }}
        titulo="¿Descartar esta venta?"
        descripcion="La venta se borra de esta PC y no queda registrada en ningún lado. La plata ya está en el cajón, así que el arqueo va a dar de más. Solo tiene sentido si ya la cargaste a mano."
        ancho="sm"
      >
        <div className="flex gap-3">
          <Boton variante="fantasma" anchoCompleto onClick={() => setADescartar(null)}>
            No descartar
          </Boton>
          <Boton
            variante="peligro"
            anchoCompleto
            onClick={() => {
              if (aDescartar) descartarUna.mutate(aDescartar.claveIdempotencia);
              setADescartar(null);
            }}
          >
            Descartar igual
          </Boton>
        </div>
      </Dialogo>
    </div>
  );
}

function Fila({
  venta,
  esMia,
  puedeDescartar,
  ocupado,
  alReintentar,
  alDescartar,
}: {
  venta: VentaPendiente;
  esMia: boolean;
  puedeDescartar: boolean;
  ocupado: boolean;
  alReintentar: () => void;
  alDescartar: () => void;
}) {
  const rechazada = venta.estado === 'rechazada';

  return (
    <li
      className={
        rechazada
          ? 'rounded-md border border-error bg-error-fondo p-4'
          : 'rounded-md border border-borde bg-superficie p-4'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg text-texto">{formatearMoneda(venta.totalCobradoCentavos)}</span>
            <Insignia tono={rechazada ? 'error' : 'advertencia'}>
              {rechazada ? 'Rechazada' : 'En cola'}
            </Insignia>
            {!esMia ? <Insignia tono="neutro">De {venta.usuarioNombre}</Insignia> : null}
            {venta.intentos > 0 ? (
              <Insignia tono="neutro">
                {venta.intentos} de {MAXIMO_INTENTOS} intentos
              </Insignia>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-texto-tenue">
            Cobrada {formatearFechaHora(new Date(venta.cobradaEn))} ·{' '}
            {venta.pagos
              .map(
                (pago) =>
                  `${NOMBRE_METODO_PAGO[pago.metodo as MetodoPago] ?? pago.metodo} ${formatearMoneda(pago.montoCentavos)}`,
              )
              .join(' + ')}
            {venta.vueltoCentavos > 0 ? ` · vuelto ${formatearMoneda(venta.vueltoCentavos)}` : ''}
          </p>
        </div>

        {rechazada ? (
          <div className="flex gap-2">
            <Boton tamano="sm" variante="contorno" onClick={alReintentar} disabled={ocupado}>
              Reintentar
            </Boton>
            {puedeDescartar ? (
              <Boton tamano="sm" variante="fantasma" onClick={alDescartar} disabled={ocupado}>
                Descartar
              </Boton>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="mt-3 flex flex-col gap-1 border-t border-borde pt-3 text-sm">
        {venta.items.map((item, indice) => (
          <li key={`${item.productoId}-${indice}`} className="flex justify-between gap-4">
            <span className="min-w-0 truncate text-texto-suave">{item.nombre}</span>
            <span className="shrink-0 text-texto-tenue">
              {formatearCantidad(item.cantidadMilesimas, item.unidad)} ×{' '}
              {formatearMoneda(item.precioUnitarioCentavos)}
            </span>
          </li>
        ))}
      </ul>

      {venta.ultimoError ? (
        <p className="mt-3 text-sm text-error">
          {rechazada ? 'El servidor la rechazó: ' : 'Último intento: '}
          {venta.ultimoError}
        </p>
      ) : null}
    </li>
  );
}
