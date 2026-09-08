'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Aviso, EsqueletoFilas, EstadoError, EstadoVacio } from '@/components/ui/estados';
import { Insignia } from '@/components/ui/insignia';
import { useEstadoDeCaja } from '@/hooks/use-caja';
import { useCola } from '@/hooks/use-cola';
import { api, mensajeDeError } from '@/lib/cliente-api';
import { parsearMontoACentavos } from '@/lib/dinero';
import {
  formatearDiferencia,
  formatearFechaHora,
  formatearHora,
  formatearMoneda,
} from '@/lib/formato';
import { NOMBRE_TIPO_MOVIMIENTO_CAJA, type TipoMovimientoCaja } from '@/lib/validacion/enums';

interface MovimientoDeCaja {
  id: string;
  tipo: string;
  montoCentavos: number;
  motivo: string | null;
  creadoEn: string;
  usuario: { nombre: string };
}

interface ResultadoCierre {
  arqueo: {
    esperadoCentavos: number;
    declaradoCentavos: number;
    diferenciaCentavos: number;
    falta: boolean;
    sobra: boolean;
  };
  totales: { cantidadVentas: number; totalVendidoCentavos: number };
}

/**
 * Caja: apertura, retiros, ingresos y cierre.
 *
 * El cierre es ciego: hasta que el cajero no declara lo que contó, la pantalla
 * no muestra en ningún lado cuánto tendría que haber. Si se lo mostrara, el
 * control no existiría — escribiría ese número y listo.
 */
export function PantallaCaja({ usuarioId }: { usuarioId: string }) {
  const clienteQuery = useQueryClient();
  const caja = useEstadoDeCaja();
  const { resumen: cola, sinAlmacen } = useCola(usuarioId);
  const [cerrando, setCerrando] = useState(false);
  const [moviendo, setMoviendo] = useState<'retiro' | 'ingreso' | null>(null);
  const [resultado, setResultado] = useState<ResultadoCierre | null>(null);

  const movimientos = useQuery({
    queryKey: ['caja', 'movimientos', caja.data?.sesion?.id],
    queryFn: () => api.get<{ movimientos: MovimientoDeCaja[] }>('/api/caja/movimientos'),
    enabled: Boolean(caja.data?.sesion),
  });

  const refrescar = () => {
    void clienteQuery.invalidateQueries({ queryKey: ['caja'] });
  };

  if (caja.isPending) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <EsqueletoFilas filas={5} />
      </div>
    );
  }

  if (caja.isError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <EstadoError mensaje={mensajeDeError(caja.error)} alReintentar={() => void caja.refetch()} />
      </div>
    );
  }

  if (!caja.data?.sesion) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        {resultado ? <ResumenDeCierre resultado={resultado} alCerrar={() => setResultado(null)} /> : null}
        <FormularioApertura alAbrir={refrescar} />
      </div>
    );
  }

  const sesion = caja.data.sesion;
  const totales = caja.data.totales;

  /*
   * La caja no se cierra con ventas en la cola, y no es una comodidad: el
   * arqueo compara lo contado contra lo que el servidor dice que se vendió. Una
   * venta que todavía está en esta PC no está en esa cuenta, así que el efectivo
   * aparecería como sobrante y quedaría escrito como diferencia de caja del
   * cajero. Es la trampa entera del modo offline: sin este bloqueo, el sistema
   * le pondría al cajero un faltante propio en el legajo.
   */
  const sinSincronizar = cola.enCola + cola.rechazadas + cola.deOtroUsuario;
  const bloqueaCierre = sinSincronizar > 0 || sinAlmacen;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl text-texto">Caja {sesion.cajaNumero}</h1>
          <p className="mt-1 text-sm text-texto-suave">
            Abierta {formatearFechaHora(new Date(sesion.abiertaEn))} · inicial{' '}
            {formatearMoneda(sesion.montoInicialCentavos)}
          </p>
        </div>
        <div className="flex gap-3">
          <Boton variante="contorno" onClick={() => setMoviendo('ingreso')}>
            Ingreso
          </Boton>
          <Boton variante="contorno" onClick={() => setMoviendo('retiro')}>
            Retiro
          </Boton>
          <Boton variante="acento" onClick={() => setCerrando(true)} disabled={bloqueaCierre}>
            Cerrar caja
          </Boton>
        </div>
      </header>

      {caja.data.espejoDe ? (
        <Aviso tipo="advertencia">
          Sin conexión: estos totales son los de las{' '}
          {formatearHora(new Date(caja.data.espejoDe))} y les faltan las ventas que se cobraron
          después. No cierres la caja con estos números.
        </Aviso>
      ) : null}

      {sinSincronizar > 0 ? (
        <Aviso tipo="advertencia">
          Hay {sinSincronizar} venta(s) cobradas en esta PC que todavía no están en el servidor.
          La caja no se puede cerrar hasta que entren: el arqueo no las cuenta y ese efectivo
          figuraría como sobrante.{' '}
          <a className="underline" href="/pendientes">
            Ver las ventas sin sincronizar
          </a>
        </Aviso>
      ) : null}

      {sinAlmacen ? (
        <Aviso tipo="error">
          No se pudo leer el almacén local, así que no se sabe si quedaron ventas sin sincronizar.
          Hasta saberlo, la caja no se cierra: un arqueo con ventas afuera queda mal para siempre.
        </Aviso>
      ) : null}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Totales del turno">
        <Tarjeta titulo="Ventas" valor={String(totales?.cantidadVentas ?? 0)} />
        <Tarjeta titulo="Vendido" valor={formatearMoneda(totales?.totalVendidoCentavos ?? 0)} />
        <Tarjeta titulo="Efectivo cobrado" valor={formatearMoneda(totales?.ventasEfectivoCentavos ?? 0)} />
        <Tarjeta titulo="Retirado" valor={formatearMoneda(totales?.retirosCentavos ?? 0)} />
      </section>

      <section aria-label="Movimientos de la caja" className="flex flex-col gap-3">
        <h2 className="text-sm text-texto-suave">Movimientos</h2>

        {movimientos.isPending ? <EsqueletoFilas filas={4} /> : null}

        {movimientos.isError ? (
          <EstadoError
            mensaje={mensajeDeError(movimientos.error)}
            alReintentar={() => void movimientos.refetch()}
          />
        ) : null}

        {movimientos.data?.movimientos.length === 0 ? (
          <EstadoVacio
            titulo="Todavía no hubo movimientos"
            descripcion="Acá van a aparecer las ventas en efectivo, los retiros y los ingresos del turno."
          />
        ) : null}

        {movimientos.data && movimientos.data.movimientos.length > 0 ? (
          <ul className="overflow-hidden rounded-md border border-borde">
            {movimientos.data.movimientos.map((movimiento) => (
              <li
                key={movimiento.id}
                className="flex items-center justify-between gap-4 border-b border-borde bg-superficie px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-base text-texto">
                    {NOMBRE_TIPO_MOVIMIENTO_CAJA[movimiento.tipo as TipoMovimientoCaja] ??
                      movimiento.tipo}
                  </p>
                  <p className="mt-1 truncate text-xs text-texto-tenue">
                    {formatearHora(new Date(movimiento.creadoEn))} · {movimiento.usuario.nombre}
                    {movimiento.motivo ? ` · ${movimiento.motivo}` : ''}
                  </p>
                </div>
                <span
                  className={
                    movimiento.tipo === 'retiro' || movimiento.tipo === 'devolucion'
                      ? 'text-base text-advertencia'
                      : 'text-base text-texto'
                  }
                >
                  {movimiento.tipo === 'retiro' || movimiento.tipo === 'devolucion' ? '−' : '+'}
                  {formatearMoneda(movimiento.montoCentavos)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <DialogoMovimiento
        tipo={moviendo}
        alCerrar={() => setMoviendo(null)}
        alHecho={() => {
          setMoviendo(null);
          refrescar();
          void movimientos.refetch();
        }}
      />

      <DialogoCierre
        abierto={cerrando}
        alCerrar={() => setCerrando(false)}
        alHecho={(datos) => {
          setCerrando(false);
          setResultado(datos);
          refrescar();
        }}
      />

      {resultado ? <ResumenDeCierre resultado={resultado} alCerrar={() => setResultado(null)} /> : null}
    </div>
  );
}

function Tarjeta({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-md border border-borde bg-superficie p-4">
      <p className="text-xs text-texto-tenue">{titulo}</p>
      <p className="mt-2 text-xl text-texto">{valor}</p>
    </div>
  );
}

function FormularioApertura({ alAbrir }: { alAbrir: () => void }) {
  const [cajaNumero, setCajaNumero] = useState('1');
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apertura = useMutation({
    mutationFn: (datos: { cajaNumero: number; montoInicialCentavos: number }) =>
      api.post('/api/caja', datos),
    onSuccess: alAbrir,
    onError: (fallo) => setError(mensajeDeError(fallo)),
  });

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-borde bg-superficie p-6"
      onSubmit={(evento) => {
        evento.preventDefault();
        setError(null);
        const centavos = parsearMontoACentavos(monto);
        if (centavos === null) {
          setError('Escribí el monto inicial, por ejemplo 50000.');
          return;
        }
        const numero = Number(cajaNumero);
        if (!Number.isInteger(numero) || numero < 1 || numero > 9) {
          setError('El número de caja tiene que ser un número del 1 al 9.');
          return;
        }
        apertura.mutate({ cajaNumero: numero, montoInicialCentavos: centavos });
      }}
    >
      <div>
        <h1 className="text-xl text-texto">Abrir la caja</h1>
        <p className="mt-2 text-sm text-texto-suave">
          El monto inicial es la plata con la que arranca el turno. Sin caja abierta no se puede
          cobrar: una venta sin caja no entra en ningún arqueo.
        </p>
      </div>

      <Campo
        etiqueta="Número de caja"
        inputMode="numeric"
        value={cajaNumero}
        onChange={(evento) => setCajaNumero(evento.target.value.replace(/\D/g, ''))}
        tamano="lg"
      />

      <Campo
        etiqueta="Monto inicial"
        inputMode="decimal"
        autoFocus
        placeholder="50000"
        value={monto}
        onChange={(evento) => setMonto(evento.target.value)}
        ayuda="En pesos. Se acepta 50000 o 50.000,00."
        tamano="lg"
      />

      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      <Boton type="submit" variante="acento" tamano="lg" anchoCompleto disabled={apertura.isPending}>
        {apertura.isPending ? 'Abriendo…' : 'Abrir caja'}
      </Boton>
    </form>
  );
}

function DialogoMovimiento({
  tipo,
  alCerrar,
  alHecho,
}: {
  tipo: 'retiro' | 'ingreso' | null;
  alCerrar: () => void;
  alHecho: () => void;
}) {
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const movimiento = useMutation({
    mutationFn: (datos: { tipo: string; montoCentavos: number; motivo: string }) =>
      api.post('/api/caja/movimientos', datos),
    onSuccess: () => {
      setMonto('');
      setMotivo('');
      setError(null);
      alHecho();
    },
    onError: (fallo) => setError(mensajeDeError(fallo)),
  });

  return (
    <Dialogo
      abierto={tipo !== null}
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo={tipo === 'retiro' ? 'Retiro de caja' : 'Ingreso a caja'}
      descripcion={
        tipo === 'retiro'
          ? 'Plata que sale del cajón durante el turno. Queda registrada con quién la sacó.'
          : 'Plata que entra al cajón fuera de una venta.'
      }
      ancho="sm"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          setError(null);
          const centavos = parsearMontoACentavos(monto);
          if (centavos === null || centavos <= 0) {
            setError('Escribí un monto mayor a 0.');
            return;
          }
          if (motivo.trim().length < 3) {
            setError('Escribí el motivo, al menos 3 caracteres.');
            return;
          }
          movimiento.mutate({ tipo: tipo ?? 'retiro', montoCentavos: centavos, motivo });
        }}
      >
        <Campo
          etiqueta="Monto"
          inputMode="decimal"
          autoFocus
          value={monto}
          onChange={(evento) => setMonto(evento.target.value)}
          tamano="lg"
        />
        <Campo
          etiqueta="Motivo"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder={tipo === 'retiro' ? 'Retiro a caja fuerte' : 'Cambio del día'}
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

function DialogoCierre({
  abierto,
  alCerrar,
  alHecho,
}: {
  abierto: boolean;
  alCerrar: () => void;
  alHecho: (resultado: ResultadoCierre) => void;
}) {
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cierre = useMutation({
    mutationFn: (montoDeclaradoCentavos: number) =>
      api.post<ResultadoCierre>('/api/caja/cerrar', { montoDeclaradoCentavos }),
    onSuccess: (datos) => {
      setMonto('');
      setError(null);
      alHecho(datos);
    },
    onError: (fallo) => setError(mensajeDeError(fallo)),
  });

  return (
    <Dialogo
      abierto={abierto}
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo="Cerrar la caja"
      descripcion="Contá la plata del cajón y escribí el total. El sistema no te muestra lo esperado hasta que lo declares."
      ancho="sm"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          setError(null);
          const centavos = parsearMontoACentavos(monto);
          if (centavos === null) {
            setError('Escribí el total contado, por ejemplo 187450.');
            return;
          }
          cierre.mutate(centavos);
        }}
      >
        <Campo
          etiqueta="Total contado"
          inputMode="decimal"
          autoFocus
          value={monto}
          onChange={(evento) => setMonto(evento.target.value)}
          tamano="lg"
        />

        {error ? <Aviso tipo="error">{error}</Aviso> : null}

        <div className="flex gap-3">
          <Boton type="button" variante="fantasma" anchoCompleto onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" variante="acento" anchoCompleto disabled={cierre.isPending}>
            {cierre.isPending ? 'Cerrando…' : 'Cerrar caja'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}

function ResumenDeCierre({
  resultado,
  alCerrar,
}: {
  resultado: ResultadoCierre;
  alCerrar: () => void;
}) {
  const { arqueo } = resultado;
  const tono = arqueo.diferenciaCentavos === 0 ? 'exito' : arqueo.falta ? 'error' : 'advertencia';

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-md border border-borde bg-superficie p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-texto">Caja cerrada</h2>
        <Insignia tono={tono}>
          {arqueo.diferenciaCentavos === 0
            ? 'Sin diferencia'
            : arqueo.falta
              ? 'Falta plata'
              : 'Sobra plata'}
        </Insignia>
      </div>

      <dl className="flex flex-col gap-2 text-base">
        <div className="flex justify-between text-texto-suave">
          <dt>Esperado</dt>
          <dd>{formatearMoneda(arqueo.esperadoCentavos)}</dd>
        </div>
        <div className="flex justify-between text-texto-suave">
          <dt>Declarado</dt>
          <dd>{formatearMoneda(arqueo.declaradoCentavos)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-borde pt-2">
          <dt className="text-texto-suave">Diferencia</dt>
          <dd className="text-2xl text-texto">{formatearDiferencia(arqueo.diferenciaCentavos)}</dd>
        </div>
      </dl>

      <p className="text-sm text-texto-tenue">
        {resultado.totales.cantidadVentas} ventas por{' '}
        {formatearMoneda(resultado.totales.totalVendidoCentavos)} en el turno.
      </p>

      <Boton variante="contorno" onClick={alCerrar}>
        Entendido
      </Boton>
    </div>
  );
}
