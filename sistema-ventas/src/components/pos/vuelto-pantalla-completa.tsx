'use client';

import { useEffect } from 'react';
import { formatearMoneda } from '@/lib/formato';

const SEGUNDOS_EN_PANTALLA = 3;

/**
 * El vuelto, a pantalla completa, durante tres segundos.
 *
 * Dar mal el vuelto es el error más caro del mostrador y el más difícil de
 * rastrear: cuando aparece en el arqueo ya pasaron ocho horas. Un número de
 * 64px que tapa todo lo demás no se pasa por alto.
 *
 * Se cierra solo, y también con cualquier tecla o clic: si el cajero ya lo
 * leyó, esperar tres segundos es una eternidad con gente en la fila.
 */
export function VueltoPantallaCompleta({
  vueltoCentavos,
  numeroVenta,
  alCerrar,
}: {
  vueltoCentavos: number;
  numeroVenta: number;
  alCerrar: () => void;
}) {
  useEffect(() => {
    const temporizador = window.setTimeout(alCerrar, SEGUNDOS_EN_PANTALLA * 1000);
    const alPresionar = () => alCerrar();
    window.addEventListener('keydown', alPresionar);
    return () => {
      window.clearTimeout(temporizador);
      window.removeEventListener('keydown', alPresionar);
    };
  }, [alCerrar]);

  return (
    <div
      role="alertdialog"
      aria-label="Vuelto"
      onClick={alCerrar}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-fondo"
    >
      <p className="text-lg text-texto-suave">
        {vueltoCentavos > 0 ? 'Vuelto' : 'Cobrado justo'}
      </p>
      {/* 64px es el tope de la escala tipográfica. No se inventa un tamaño
          nuevo para esta pantalla: la escala existe para eso (§7.1). */}
      <p className="text-4xl text-acento">{formatearMoneda(vueltoCentavos)}</p>
      <p className="text-sm text-texto-tenue">
        Venta {numeroVenta} · toca una tecla para seguir
      </p>
    </div>
  );
}
