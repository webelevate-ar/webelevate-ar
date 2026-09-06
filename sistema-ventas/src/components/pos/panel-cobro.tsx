'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Aviso } from '@/components/ui/estados';
import {
  BILLETES_SUGERIDOS_CENTAVOS,
  calcularVuelto,
  parsearMontoACentavos,
} from '@/lib/dinero';
import { formatearMoneda, formatearMonedaRedonda } from '@/lib/formato';
import { cn } from '@/lib/utils';
import { NOMBRE_METODO_PAGO, type MetodoPago } from '@/lib/validacion/enums';

export interface PagoCargado {
  metodo: MetodoPago;
  montoCentavos: number;
}

/**
 * Cobro.
 *
 * Ocupa la pantalla entera en vez de abrirse como modal: un modal de
 * confirmación en el flujo de cobro es de los anti-patrones del §17, y además
 * a 1366×768 un modal deja la mitad de la pantalla inservible.
 *
 * El camino rápido es una sola tecla: `Enter` con el campo vacío cobra el
 * importe justo en efectivo. Escribir un monto y `Enter` cobra con vuelto.
 */
export function PanelCobro({
  totalCentavos,
  alConfirmar,
  alCancelar,
  enviando,
  error,
}: {
  totalCentavos: number;
  alConfirmar: (pagos: PagoCargado[]) => void;
  alCancelar: () => void;
  enviando: boolean;
  error: string | null;
}) {
  const [pagos, setPagos] = useState<PagoCargado[]>([]);
  const [monto, setMonto] = useState('');
  const campoRef = useRef<HTMLInputElement>(null);

  const cobrado = pagos.reduce((suma, pago) => suma + pago.montoCentavos, 0);
  const falta = Math.max(0, totalCentavos - cobrado);
  const efectivoCargado = pagos.reduce(
    (suma, pago) => (pago.metodo === 'efectivo' ? suma + pago.montoCentavos : suma),
    0,
  );

  const vuelto = useMemo(() => {
    if (cobrado < totalCentavos) return 0;
    try {
      return calcularVuelto(totalCentavos, pagos);
    } catch {
      return 0;
    }
  }, [cobrado, pagos, totalCentavos]);

  // El vuelto solo puede salir del efectivo: si alguien carga $10.000 de débito
  // por una compra de $8.000, eso no es vuelto, es un error de tipeo.
  const excedeElEfectivo = cobrado > totalCentavos && cobrado - totalCentavos > efectivoCargado;

  useEffect(() => {
    campoRef.current?.focus();
  }, [pagos.length]);

  const agregarPago = (metodo: MetodoPago, montoCentavos: number) => {
    if (montoCentavos <= 0) return;
    setPagos((actuales) => [...actuales, { metodo, montoCentavos }]);
    setMonto('');
  };

  const confirmar = () => {
    if (enviando || excedeElEfectivo) return;
    if (cobrado >= totalCentavos && pagos.length > 0) {
      alConfirmar(pagos);
      return;
    }
    // Nada cargado y `Enter`: es el caso más común del mostrador, el importe
    // justo en efectivo. Se cobra en una sola tecla.
    if (pagos.length === 0 && monto.trim() === '') {
      alConfirmar([{ metodo: 'efectivo', montoCentavos: totalCentavos }]);
    }
  };

  const alTeclearEnCampo = (tecla: string) => {
    if (tecla !== 'Enter') return;
    const centavos = parsearMontoACentavos(monto);
    if (centavos === null || centavos === 0) {
      confirmar();
      return;
    }
    const nuevos: PagoCargado[] = [...pagos, { metodo: 'efectivo', montoCentavos: centavos }];
    const nuevoTotal = nuevos.reduce((suma, pago) => suma + pago.montoCentavos, 0);
    const nuevoEfectivo = nuevos.reduce(
      (suma, pago) => (pago.metodo === 'efectivo' ? suma + pago.montoCentavos : suma),
      0,
    );
    if (nuevoTotal >= totalCentavos && nuevoTotal - totalCentavos <= nuevoEfectivo) {
      alConfirmar(nuevos);
    } else {
      setPagos(nuevos);
      setMonto('');
    }
  };

  return (
    <section className="flex h-full flex-col p-6" aria-label="Cobro">
      <header className="mb-6 flex shrink-0 items-baseline justify-between">
        <h2 className="text-lg text-texto-suave">Cobrar</h2>
        <p className="text-4xl text-acento">{formatearMoneda(totalCentavos)}</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
        {/* Efectivo */}
        <div className="flex flex-col gap-4 overflow-y-auto">
          <div>
            <label htmlFor="monto-efectivo" className="mb-2 block text-sm text-texto-suave">
              Efectivo recibido
            </label>
            <input
              ref={campoRef}
              id="monto-efectivo"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              placeholder={`Enter cobra justo: ${formatearMoneda(falta)}`}
              onChange={(evento) => setMonto(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') {
                  evento.preventDefault();
                  alTeclearEnCampo('Enter');
                }
              }}
              className="h-16 w-full rounded-sm border border-borde-fuerte bg-superficie px-4 text-2xl text-texto placeholder:text-base placeholder:text-texto-tenue focus:border-info focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {BILLETES_SUGERIDOS_CENTAVOS.map((billete) => (
              <Boton
                key={billete}
                tamano="lg"
                variante="solido"
                onClick={() => setMonto(String(billete / 100))}
              >
                {formatearMonedaRedonda(billete)}
              </Boton>
            ))}
            <Boton
              tamano="lg"
              variante="contorno"
              className="col-span-2"
              onClick={() => agregarPago('efectivo', falta)}
            >
              Justo · {formatearMoneda(falta)}
            </Boton>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {(['debito', 'credito', 'qr'] as const).map((metodo) => (
              <Boton
                key={metodo}
                tamano="lg"
                variante="solido"
                disabled={falta === 0}
                onClick={() => agregarPago(metodo, falta)}
              >
                {NOMBRE_METODO_PAGO[metodo]}
              </Boton>
            ))}
          </div>
        </div>

        {/* Resumen */}
        <div className="flex flex-col gap-4 overflow-y-auto rounded-md border border-borde bg-superficie p-4">
          {pagos.length === 0 ? (
            <p className="text-sm text-texto-tenue">
              Sin pagos cargados. Con el campo vacío, Enter cobra el importe justo en efectivo.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pagos.map((pago, indice) => (
                <li
                  key={`${pago.metodo}-${indice}`}
                  className="flex items-center justify-between gap-3 border-b border-borde pb-2 text-base"
                >
                  <span className="text-texto-suave">{NOMBRE_METODO_PAGO[pago.metodo]}</span>
                  <span className="text-texto">{formatearMoneda(pago.montoCentavos)}</span>
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    aria-label={`Quitar el pago de ${NOMBRE_METODO_PAGO[pago.metodo]}`}
                    onClick={() =>
                      setPagos((actuales) => actuales.filter((_, posicion) => posicion !== indice))
                    }
                  >
                    Quitar
                  </Boton>
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-auto flex flex-col gap-2 text-base">
            <div className="flex justify-between text-texto-suave">
              <dt>Cobrado</dt>
              <dd>{formatearMoneda(cobrado)}</dd>
            </div>
            <div className={cn('flex justify-between', falta > 0 ? 'text-advertencia' : 'text-texto-suave')}>
              <dt>Falta</dt>
              <dd>{formatearMoneda(falta)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-borde pt-2">
              <dt className="text-texto-suave">Vuelto</dt>
              <dd className="text-2xl text-texto">{formatearMoneda(vuelto)}</dd>
            </div>
          </dl>

          {excedeElEfectivo ? (
            <Aviso tipo="error">
              El vuelto solo puede salir del efectivo. Revisá el monto cargado con tarjeta.
            </Aviso>
          ) : null}

          {error ? <Aviso tipo="error">{error}</Aviso> : null}

          <Boton
            variante="acento"
            tamano="xl"
            anchoCompleto
            disabled={enviando || excedeElEfectivo || (falta > 0 && pagos.length > 0)}
            onClick={confirmar}
          >
            {enviando ? 'Cobrando…' : 'Confirmar cobro · Enter'}
          </Boton>
          <Boton variante="fantasma" anchoCompleto onClick={alCancelar} disabled={enviando}>
            Volver a la venta · Esc
          </Boton>
        </div>
      </div>
    </section>
  );
}
