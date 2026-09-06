'use client';

import { useEffect, useState } from 'react';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { calcularDescuentoPorPorcentaje } from '@/lib/dinero';
import { formatearMoneda } from '@/lib/formato';

/**
 * Descuento manual (`F8`).
 *
 * Si lo pide un cajero, hace falta el PIN de un supervisor. Ese PIN se manda al
 * servidor y se verifica allá: acá solo se recoge. Comprobarlo en el navegador
 * sería seguridad de mentira (§8.6).
 */
export function DialogoDescuento({
  abierto,
  subtotalCentavos,
  pideAutorizacion,
  alCerrar,
  alAplicar,
}: {
  abierto: boolean;
  subtotalCentavos: number;
  pideAutorizacion: boolean;
  alCerrar: () => void;
  alAplicar: (porcentajeCentesimas: number, pinSupervisor: string | null) => void;
}) {
  const [porcentaje, setPorcentaje] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (abierto) {
      setPorcentaje('');
      setPin('');
      setError(null);
    }
  }, [abierto]);

  const numero = Number(porcentaje.replace(',', '.'));
  const valido = porcentaje !== '' && Number.isFinite(numero) && numero > 0 && numero <= 100;
  const centesimas = valido ? Math.round(numero * 100) : 0;
  const descuento = calcularDescuentoPorPorcentaje(subtotalCentavos, centesimas);

  const aplicar = () => {
    if (!valido) {
      setError('El descuento tiene que estar entre 0 y 100.');
      return;
    }
    if (pideAutorizacion && !/^\d{4}$/.test(pin)) {
      setError('Hace falta el PIN de 4 números de un supervisor.');
      return;
    }
    alAplicar(centesimas, pideAutorizacion ? pin : null);
  };

  return (
    <Dialogo
      abierto={abierto}
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo="Descuento manual"
      descripcion={
        pideAutorizacion
          ? 'Lo tiene que autorizar un supervisor con su PIN.'
          : 'Se aplica sobre el subtotal de la venta.'
      }
      ancho="sm"
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          aplicar();
        }}
      >
        <Campo
          autoFocus
          etiqueta="Porcentaje"
          inputMode="decimal"
          value={porcentaje}
          onChange={(evento) => setPorcentaje(evento.target.value)}
          placeholder="10"
          tamano="lg"
        />

        {pideAutorizacion ? (
          <Campo
            etiqueta="PIN del supervisor"
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(evento) => setPin(evento.target.value.replace(/\D/g, ''))}
            tamano="lg"
          />
        ) : null}

        <p className="flex items-baseline justify-between text-base">
          <span className="text-texto-suave">Se descuenta</span>
          <output aria-live="polite" className="text-2xl text-advertencia">
            {formatearMoneda(descuento)}
          </output>
        </p>

        {error ? (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Boton type="button" variante="fantasma" anchoCompleto onClick={alCerrar}>
            Cancelar
          </Boton>
          {/* El botón no se deshabilita por formulario incompleto: eso esconde
              el motivo. Se envía y el error aparece debajo del campo (§7.4). */}
          <Boton type="submit" variante="acento" anchoCompleto>
            Aplicar
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
