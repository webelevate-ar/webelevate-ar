'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { listarPendientes } from '@/lib/offline/almacen';
import { resumirCola, type VentaPendiente } from '@/lib/offline/cola';
import {
  borrarPendiente,
  reencolar,
  sincronizarCola,
  type ResumenSincronizacion,
} from '@/lib/offline/sincronizacion';

export const CLAVE_COLA = ['cola-offline'] as const;

/**
 * La cola de ventas sin sincronizar, vista desde React.
 *
 * `listarPendientes` devuelve `null` cuando no se pudo leer IndexedDB, y esa
 * diferencia se conserva hasta la pantalla: `pendientes === null` es "no sé qué
 * hay en la cola", que no es lo mismo que "la cola está vacía". La pantalla
 * tiene que decir cosas distintas en cada caso.
 */
export function useCola(usuarioId: string | null) {
  const cliente = useQueryClient();

  const consulta = useQuery({
    queryKey: CLAVE_COLA,
    queryFn: listarPendientes,
    // La cola cambia con cada cobro sin conexión: servirla de cache mostraría
    // un contador viejo justo cuando más importa que sea exacto.
    staleTime: 0,
  });

  const refrescar = useCallback(() => {
    void cliente.invalidateQueries({ queryKey: CLAVE_COLA });
  }, [cliente]);

  const pendientes: VentaPendiente[] | null = consulta.data ?? null;
  const resumen = resumirCola(pendientes ?? [], usuarioId);

  const sincronizar = useMutation<ResumenSincronizacion, Error, void>({
    mutationFn: () => {
      if (!usuarioId) throw new Error('No hay sesión para sincronizar.');
      return sincronizarCola(usuarioId);
    },
    onSettled: () => {
      refrescar();
      // Una venta que entró cambió el stock y los totales de la caja.
      void cliente.invalidateQueries({ queryKey: ['caja'] });
      void cliente.invalidateQueries({ queryKey: ['catalogo'] });
    },
  });

  const reintentarUna = useMutation<boolean, Error, VentaPendiente>({
    mutationFn: (venta) => reencolar(venta),
    onSuccess: () => {
      refrescar();
      sincronizar.mutate();
    },
  });

  const descartarUna = useMutation<boolean, Error, string>({
    mutationFn: (clave) => borrarPendiente(clave),
    onSuccess: refrescar,
  });

  return {
    consulta,
    pendientes,
    resumen,
    /** `true` cuando la consulta terminó y no se pudo leer el almacén local. */
    sinAlmacen: consulta.isSuccess && consulta.data === null,
    refrescar,
    sincronizar,
    reintentarUna,
    descartarUna,
  };
}
