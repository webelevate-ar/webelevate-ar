'use client';

import { Slot } from '@radix-ui/react-slot';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type VarianteBoton = 'acento' | 'solido' | 'contorno' | 'fantasma' | 'peligro';
export type TamanoBoton = 'sm' | 'md' | 'lg' | 'xl';

/**
 * `acento` está reservado para las acciones de cobro. Si aparece en dos lugares
 * de la misma pantalla, deja de señalar cuál es el botón que cierra la venta.
 */
const VARIANTES: Record<VarianteBoton, string> = {
  acento:
    'bg-acento text-sobre-acento hover:bg-acento-fuerte font-semibold shadow-sm disabled:bg-borde disabled:text-texto-tenue',
  solido:
    'bg-superficie-alta text-texto hover:bg-borde border border-borde-fuerte disabled:text-texto-tenue',
  contorno:
    'border border-borde-fuerte text-texto hover:bg-superficie-alta disabled:text-texto-tenue',
  fantasma: 'text-texto-suave hover:bg-superficie-alta hover:text-texto',
  peligro: 'bg-error-fondo text-error border border-error hover:bg-error hover:text-fondo',
};

// 44px de alto mínimo en todo lo que se toque (§7.8).
const TAMANOS: Record<TamanoBoton, string> = {
  sm: 'h-11 px-3 text-sm gap-2',
  md: 'h-12 px-4 text-base gap-2',
  lg: 'h-16 px-6 text-lg gap-3',
  xl: 'h-20 px-8 text-xl gap-3',
};

export interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  anchoCompleto?: boolean;
  comoHijo?: boolean;
}

export const Boton = forwardRef<HTMLButtonElement, PropsBoton>(function Boton(
  { className, variante = 'solido', tamano = 'md', anchoCompleto = false, comoHijo = false, ...props },
  ref,
) {
  const Componente = comoHijo ? Slot : 'button';
  return (
    <Componente
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-sm transition-colors select-none',
        'duration-100 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTES[variante],
        TAMANOS[tamano],
        anchoCompleto && 'w-full',
        className,
      )}
      {...props}
    />
  );
});
