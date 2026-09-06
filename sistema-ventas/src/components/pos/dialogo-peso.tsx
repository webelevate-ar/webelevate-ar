'use client';

import { useEffect, useState } from 'react';
import { TecladoNumerico } from '@/components/pos/teclado-numerico';
import { Dialogo } from '@/components/ui/dialogo';
import { multiplicarPorCantidad, parsearCantidadAMilesimas } from '@/lib/dinero';
import { formatearMoneda } from '@/lib/formato';

/**
 * Carga de un producto por peso (`F7`).
 *
 * La balanza queda fuera del alcance: el peso se teclea. El importe se muestra
 * mientras se escribe, porque es el número que el cajero le canta al cliente
 * antes de aceptar.
 */
export function DialogoPeso({
  abierto,
  nombre,
  precioPorKgCentavos,
  alCerrar,
  alAceptar,
}: {
  abierto: boolean;
  nombre: string;
  precioPorKgCentavos: number;
  alCerrar: () => void;
  alAceptar: (cantidadMilesimas: number) => void;
}) {
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (abierto) setTexto('');
  }, [abierto]);

  const milesimas = parsearCantidadAMilesimas(texto);
  const valido = milesimas !== null && milesimas > 0;
  const importe = valido ? multiplicarPorCantidad(precioPorKgCentavos, milesimas) : 0;

  const aceptar = () => {
    if (!valido || milesimas === null) return;
    alAceptar(milesimas);
  };

  return (
    <Dialogo
      abierto={abierto}
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo={nombre}
      descripcion={`${formatearMoneda(precioPorKgCentavos)} por kilo. Escribí el peso en kilos.`}
      ancho="sm"
    >
      <div className="flex flex-col gap-4">
        <label htmlFor="peso" className="sr-only">
          Peso en kilos
        </label>
        <input
          id="peso"
          type="text"
          inputMode="decimal"
          autoFocus
          value={texto}
          placeholder="0,000"
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              evento.preventDefault();
              aceptar();
            }
          }}
          className="h-16 w-full rounded-sm border border-borde-fuerte bg-fondo px-4 text-2xl text-texto focus:border-info focus:outline-none"
        />

        <p className="flex items-baseline justify-between text-base">
          <span className="text-texto-suave">Importe</span>
          <output aria-live="polite" className="text-2xl text-acento">
            {formatearMoneda(importe)}
          </output>
        </p>

        <TecladoNumerico
          conComa
          alEscribir={(digito) => setTexto((actual) => actual + digito)}
          alBorrar={() => setTexto((actual) => actual.slice(0, -1))}
          alAceptar={aceptar}
          aceptarHabilitado={valido}
          textoAceptar="Agregar al carrito"
        />
      </div>
    </Dialogo>
  );
}
