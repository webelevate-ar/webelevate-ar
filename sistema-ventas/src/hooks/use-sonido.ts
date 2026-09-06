'use client';

import { useCallback, useRef } from 'react';

/**
 * Avisos audibles, generados con la Web Audio API.
 *
 * No hay archivos de sonido: son dos osciladores de medio segundo en total y
 * así la aplicación no le pide nada a ningún servidor, ni siquiera al propio.
 *
 * El aviso importa: cuando el código no existe, el cajero está mirando el
 * producto, no la pantalla. Un mensaje en rojo que nadie ve no avisa nada.
 */
export function useSonido() {
  const contexto = useRef<AudioContext | null>(null);

  const tono = useCallback((frecuencia: number, milisegundos: number, volumen = 0.06) => {
    try {
      // El AudioContext se crea con el primer sonido: crearlo antes de que el
      // usuario interactúe lo deja suspendido en todos los navegadores.
      contexto.current ??= new AudioContext();
      const audio = contexto.current;
      if (audio.state === 'suspended') void audio.resume();

      const oscilador = audio.createOscillator();
      const ganancia = audio.createGain();
      oscilador.type = 'square';
      oscilador.frequency.value = frecuencia;
      ganancia.gain.value = volumen;
      oscilador.connect(ganancia).connect(audio.destination);
      oscilador.start();
      oscilador.stop(audio.currentTime + milisegundos / 1000);
    } catch {
      // Sin audio disponible la venta sigue: el aviso visual ya está en pantalla.
    }
  }, []);

  return {
    /** Producto agregado. Corto y agudo, para que no moleste doscientas veces por día. */
    exito: useCallback(() => tono(880, 60), [tono]),
    /** Código no encontrado. Grave y más largo: se distingue sin mirar. */
    error: useCallback(() => {
      tono(220, 160, 0.09);
      window.setTimeout(() => tono(180, 200, 0.09), 170);
    }, [tono]),
  };
}
