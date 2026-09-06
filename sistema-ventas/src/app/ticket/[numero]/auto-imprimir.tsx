'use client';

import { useEffect } from 'react';

/**
 * Abre el diálogo de impresión solo. El ticket se abre en una pestaña nueva
 * desde la pantalla de venta, así que el cajero no tiene que buscar el menú:
 * la pestaña se abre, imprime y se cierra.
 */
export function AutoImprimir() {
  useEffect(() => {
    const temporizador = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(temporizador);
  }, []);

  return null;
}
