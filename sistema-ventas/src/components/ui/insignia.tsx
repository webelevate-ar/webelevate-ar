import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TonoInsignia = 'neutro' | 'exito' | 'advertencia' | 'error' | 'info' | 'acento';

const TONOS: Record<TonoInsignia, string> = {
  neutro: 'border-borde-fuerte text-texto-suave',
  exito: 'border-exito bg-exito-fondo text-exito',
  advertencia: 'border-advertencia bg-advertencia-fondo text-advertencia',
  error: 'border-error bg-error-fondo text-error',
  info: 'border-info bg-info-fondo text-info',
  acento: 'border-acento text-acento',
};

export function Insignia({
  tono = 'neutro',
  children,
  className,
}: {
  tono?: TonoInsignia;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs',
        TONOS[tono],
        className,
      )}
    >
      {children}
    </span>
  );
}
