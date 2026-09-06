'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Boton } from './boton';

/**
 * Los cuatro estados obligatorios del §7.2. Están juntos a propósito: si viven
 * en un solo archivo, se ve de un vistazo cuál falta.
 */

/** Cargando: esqueleto con la forma del contenido real, nunca un spinner. */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('esqueleto rounded-sm', className)} />;
}

export function EsqueletoFilas({ filas = 6, className }: { filas?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-label="Cargando">
      {Array.from({ length: filas }, (_, indice) => (
        <Esqueleto key={indice} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EsqueletoGrilla({ celdas = 12 }: { celdas?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      role="status"
      aria-label="Cargando productos"
    >
      {Array.from({ length: celdas }, (_, indice) => (
        <Esqueleto key={indice} className="h-24" />
      ))}
    </div>
  );
}

/** Vacío: qué es esto, y el botón de la acción siguiente. "No hay datos" no sirve. */
export function EstadoVacio({
  icono,
  titulo,
  descripcion,
  accion,
}: {
  icono?: ReactNode;
  titulo: string;
  descripcion: string;
  accion?: { texto: string; alPresionar: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-md border border-borde bg-superficie p-12 text-center">
      {icono ? <div className="text-texto-tenue">{icono}</div> : null}
      <div className="flex flex-col gap-2">
        <p className="text-lg text-texto">{titulo}</p>
        <p className="max-w-md text-sm text-texto-suave">{descripcion}</p>
      </div>
      {accion ? (
        <Boton variante="contorno" onClick={accion.alPresionar}>
          {accion.texto}
        </Boton>
      ) : null}
    </div>
  );
}

/** Error: qué pasó en lenguaje humano y un botón de reintentar. Nunca un código crudo. */
export function EstadoError({
  titulo = 'No se pudieron cargar los datos',
  mensaje,
  alReintentar,
}: {
  titulo?: string;
  mensaje: string;
  alReintentar?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-md border border-error bg-error-fondo p-12 text-center"
    >
      <div className="flex flex-col gap-2">
        <p className="text-lg text-error">{titulo}</p>
        <p className="max-w-md text-sm text-texto-suave">{mensaje}</p>
      </div>
      {alReintentar ? (
        <Boton variante="contorno" onClick={alReintentar}>
          Reintentar
        </Boton>
      ) : null}
    </div>
  );
}

export type TipoAviso = 'exito' | 'advertencia' | 'error' | 'info';

const ESTILOS_AVISO: Record<TipoAviso, string> = {
  exito: 'border-exito bg-exito-fondo text-exito',
  advertencia: 'border-advertencia bg-advertencia-fondo text-advertencia',
  error: 'border-error bg-error-fondo text-error',
  info: 'border-info bg-info-fondo text-info',
};

/**
 * Nada se comunica solo por color (§7.8): el aviso siempre lleva su símbolo.
 * El de stock es el caso concreto — amarillo y triángulo, no solo amarillo.
 */
const SIMBOLOS: Record<TipoAviso, string> = {
  exito: '✓',
  advertencia: '▲',
  error: '✕',
  info: 'i',
};

export function Aviso({
  tipo = 'info',
  children,
  className,
}: {
  tipo?: TipoAviso;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tipo === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-sm border px-4 py-3 text-sm',
        ESTILOS_AVISO[tipo],
        className,
      )}
    >
      <span aria-hidden="true" className="font-bold">
        {SIMBOLOS[tipo]}
      </span>
      <div className="text-texto">{children}</div>
    </div>
  );
}
