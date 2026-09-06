'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta?: string;
  /** Texto concreto: "El precio tiene que ser mayor a 0", no "Valor inválido". */
  error?: string;
  ayuda?: ReactNode;
  tamano?: 'md' | 'lg';
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { className, etiqueta, error, ayuda, tamano = 'md', id, ...props },
  ref,
) {
  const idGenerado = useId();
  const idCampo = id ?? idGenerado;
  const idError = `${idCampo}-error`;
  const idAyuda = `${idCampo}-ayuda`;

  return (
    <div className="flex flex-col gap-2">
      {etiqueta ? (
        <label htmlFor={idCampo} className="text-sm text-texto-suave">
          {etiqueta}
        </label>
      ) : null}
      <input
        ref={ref}
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(error && idError, ayuda && idAyuda) || undefined}
        className={cn(
          'w-full rounded-sm border bg-superficie px-4 text-texto placeholder:text-texto-tenue',
          'transition-colors outline-none',
          tamano === 'lg' ? 'h-16 text-lg' : 'h-12 text-base',
          error ? 'border-error' : 'border-borde-fuerte focus:border-info',
          className,
        )}
        {...props}
      />
      {ayuda ? (
        <p id={idAyuda} className="text-xs text-texto-tenue">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p id={idError} role="alert" className="text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
});
