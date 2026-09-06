'use client';

import { create } from 'zustand';
import {
  calcularDescuentoPorPorcentaje,
  calcularSubtotal,
  calcularTotal,
  MILESIMAS_POR_UNIDAD,
  multiplicarPorCantidad,
} from '@/lib/dinero';
import type { Unidad } from '@/lib/validacion/enums';

/**
 * Carrito en curso. Es la única pieza de estado global de cliente (§7.5): todo
 * lo demás es estado de servidor y vive en TanStack Query, o estado de URL.
 *
 * El total que se ve acá es para el cajero. El que vale es el que recalcula el
 * servidor a partir de los ítems (§17): si el servidor confiara en este
 * número, cualquiera con la consola abierta se cobraría lo que quisiera.
 */

export interface ItemCarrito {
  productoId: string;
  nombre: string;
  sku: string;
  unidad: Unidad;
  precioUnitarioCentavos: number;
  cantidadMilesimas: number;
  /** Stock al momento de agregarlo, solo para pintar el aviso amarillo. */
  stockMilesimas: number;
}

export interface VentaSuspendida {
  id: string;
  momento: number;
  items: ItemCarrito[];
  descuentoPorcentajeCentesimas: number;
}

interface EstadoCarrito {
  items: ItemCarrito[];
  indiceSeleccionado: number;
  descuentoPorcentajeCentesimas: number;
  /** Quién autorizó el descuento. Se manda al servidor para que lo verifique. */
  pinSupervisor: string | null;
  suspendidas: VentaSuspendida[];
  /**
   * Se genera al abrir la venta, no al enviarla: si se generara al enviar, un
   * reintento traería una clave nueva y el servidor cobraría dos veces (§8.4).
   */
  claveIdempotencia: string;

  agregar: (item: Omit<ItemCarrito, 'cantidadMilesimas'>, cantidadMilesimas?: number) => void;
  quitar: (indice: number) => void;
  cambiarCantidad: (indice: number, cantidadMilesimas: number) => void;
  sumarUnidad: (indice: number, delta: number) => void;
  seleccionar: (indice: number) => void;
  moverSeleccion: (delta: number) => void;
  aplicarDescuento: (porcentajeCentesimas: number, pinSupervisor: string | null) => void;
  quitarDescuento: () => void;
  limpiar: () => void;
  suspender: () => void;
  retomar: (id: string) => void;
  descartarSuspendida: (id: string) => void;
}

function nuevaClave(): string {
  // `crypto.randomUUID` existe en todos los navegadores que corren esta app y
  // en Node; el respaldo es para el render del servidor en entornos viejos.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useCarrito = create<EstadoCarrito>((set, get) => ({
  items: [],
  indiceSeleccionado: -1,
  descuentoPorcentajeCentesimas: 0,
  pinSupervisor: null,
  suspendidas: [],
  claveIdempotencia: nuevaClave(),

  agregar: (item, cantidadMilesimas) =>
    set((estado) => {
      // Sin cantidad explícita se agrega una unidad. Lo que se pesa nunca llega
      // acá sin cantidad: la pantalla abre antes el teclado de kilos.
      const cantidad = cantidadMilesimas ?? MILESIMAS_POR_UNIDAD;
      const existente = estado.items.findIndex((fila) => fila.productoId === item.productoId);

      // Escanear dos veces el mismo producto suma cantidad, no agrega otra
      // línea. Es la diferencia entre un ticket legible y uno de doce renglones.
      if (existente >= 0) {
        const items = estado.items.map((fila, indice) =>
          indice === existente
            ? { ...fila, cantidadMilesimas: fila.cantidadMilesimas + cantidad }
            : fila,
        );
        return { items, indiceSeleccionado: existente };
      }

      return {
        items: [...estado.items, { ...item, cantidadMilesimas: cantidad }],
        indiceSeleccionado: estado.items.length,
      };
    }),

  quitar: (indice) =>
    set((estado) => {
      const items = estado.items.filter((_, posicion) => posicion !== indice);
      return {
        items,
        indiceSeleccionado: Math.min(estado.indiceSeleccionado, items.length - 1),
      };
    }),

  cambiarCantidad: (indice, cantidadMilesimas) =>
    set((estado) => {
      if (cantidadMilesimas <= 0) {
        const items = estado.items.filter((_, posicion) => posicion !== indice);
        return { items, indiceSeleccionado: Math.min(indice, items.length - 1) };
      }
      return {
        items: estado.items.map((fila, posicion) =>
          posicion === indice ? { ...fila, cantidadMilesimas } : fila,
        ),
      };
    }),

  sumarUnidad: (indice, delta) => {
    const item = get().items[indice];
    if (!item) return;
    // Lo que se pesa se mueve de a 100 g; lo que se cuenta, de a una unidad.
    const paso = item.unidad === 'kg' ? 100 : MILESIMAS_POR_UNIDAD;
    get().cambiarCantidad(indice, item.cantidadMilesimas + delta * paso);
  },

  seleccionar: (indice) => set({ indiceSeleccionado: indice }),

  moverSeleccion: (delta) =>
    set((estado) => {
      if (estado.items.length === 0) return { indiceSeleccionado: -1 };
      const siguiente = estado.indiceSeleccionado + delta;
      return {
        indiceSeleccionado: Math.max(0, Math.min(estado.items.length - 1, siguiente)),
      };
    }),

  aplicarDescuento: (porcentajeCentesimas, pinSupervisor) =>
    set({ descuentoPorcentajeCentesimas: porcentajeCentesimas, pinSupervisor }),

  quitarDescuento: () => set({ descuentoPorcentajeCentesimas: 0, pinSupervisor: null }),

  limpiar: () =>
    set({
      items: [],
      indiceSeleccionado: -1,
      descuentoPorcentajeCentesimas: 0,
      pinSupervisor: null,
      claveIdempotencia: nuevaClave(),
    }),

  suspender: () =>
    set((estado) => {
      if (estado.items.length === 0) return estado;
      return {
        suspendidas: [
          ...estado.suspendidas,
          {
            id: nuevaClave(),
            momento: Date.now(),
            items: estado.items,
            descuentoPorcentajeCentesimas: estado.descuentoPorcentajeCentesimas,
          },
        ],
        items: [],
        indiceSeleccionado: -1,
        descuentoPorcentajeCentesimas: 0,
        pinSupervisor: null,
        claveIdempotencia: nuevaClave(),
      };
    }),

  retomar: (id) =>
    set((estado) => {
      const guardada = estado.suspendidas.find((venta) => venta.id === id);
      if (!guardada) return estado;

      // Si había algo en el carrito al retomar, se suspende en lugar de
      // perderse: el cliente que está en el mostrador no tiene la culpa.
      const aGuardar: VentaSuspendida[] =
        estado.items.length > 0
          ? [
              {
                id: nuevaClave(),
                momento: Date.now(),
                items: estado.items,
                descuentoPorcentajeCentesimas: estado.descuentoPorcentajeCentesimas,
              },
            ]
          : [];

      return {
        items: guardada.items,
        indiceSeleccionado: guardada.items.length - 1,
        descuentoPorcentajeCentesimas: guardada.descuentoPorcentajeCentesimas,
        pinSupervisor: null,
        claveIdempotencia: nuevaClave(),
        suspendidas: [...estado.suspendidas.filter((venta) => venta.id !== id), ...aGuardar],
      };
    }),

  descartarSuspendida: (id) =>
    set((estado) => ({ suspendidas: estado.suspendidas.filter((venta) => venta.id !== id) })),
}));

export interface TotalesCarrito {
  subtotalCentavos: number;
  descuentoCentavos: number;
  totalCentavos: number;
  cantidadItems: number;
}

/** Los totales se derivan de los ítems; no se guardan como estado aparte. */
export function calcularTotales(
  items: readonly ItemCarrito[],
  descuentoPorcentajeCentesimas: number,
): TotalesCarrito {
  const subtotal = calcularSubtotal(items);
  const descuento = calcularDescuentoPorPorcentaje(subtotal, descuentoPorcentajeCentesimas);
  return {
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    totalCentavos: calcularTotal(subtotal, descuento),
    cantidadItems: items.length,
  };
}

export function subtotalDeItem(item: ItemCarrito): number {
  return multiplicarPorCantidad(item.precioUnitarioCentavos, item.cantidadMilesimas);
}
