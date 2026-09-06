'use client';

import * as Radix from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Diálogo. Se usa poco a propósito: cada confirmación cuesta segundos por venta
 * y cientos de ventas por día (§6). En el flujo de cobro no hay ninguno.
 *
 * Radix se encarga del foco atrapado, del `Esc` y del `aria`, que es
 * exactamente lo que rompe un modal hecho a mano.
 */
export function Dialogo({
  abierto,
  alCambiar,
  titulo,
  descripcion,
  children,
  ancho = 'md',
}: {
  abierto: boolean;
  alCambiar: (abierto: boolean) => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  ancho?: 'sm' | 'md' | 'lg';
}) {
  const anchos = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' } as const;

  return (
    <Radix.Root open={abierto} onOpenChange={alCambiar}>
      <Radix.Portal>
        <Radix.Overlay className="fixed inset-0 bg-fondo/80" />
        <Radix.Content
          className={cn(
            'fixed top-1/2 left-1/2 w-full -translate-x-1/2 -translate-y-1/2',
            'rounded-md border border-borde-fuerte bg-superficie p-6 shadow-md',
            'max-h-screen overflow-y-auto',
            anchos[ancho],
          )}
        >
          <Radix.Title className="text-lg text-texto">{titulo}</Radix.Title>
          {descripcion ? (
            <Radix.Description className="mt-2 text-sm text-texto-suave">
              {descripcion}
            </Radix.Description>
          ) : (
            <Radix.Description className="sr-only">{titulo}</Radix.Description>
          )}
          <div className="mt-6">{children}</div>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
