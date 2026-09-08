'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Insignia } from '@/components/ui/insignia';
import { useCola } from '@/hooks/use-cola';
import { useConexion } from '@/hooks/use-conexion';
import { hayConexion } from '@/lib/offline/conexion';
import { registrarServiceWorker } from '@/lib/offline/service-worker';

const ESPERA_ENTRE_INTENTOS_MS = 30_000;

/**
 * El estado del modo offline, en la barra de navegación.
 *
 * Además de mostrar, hace: es el único lugar de la aplicación que dispara la
 * sincronización de la cola. Va acá porque la barra está montada en todas las
 * pantallas y en ninguna dos veces — si esto viviera en la pantalla de venta,
 * un cajero que dejara abierto el panel no sincronizaría nunca.
 *
 * Cuando no hay nada que decir no muestra nada. Un cartel verde de "conectado"
 * permanente se vuelve invisible en dos días, y entonces el rojo tampoco se ve.
 */
export function EstadoOffline({ usuarioId }: { usuarioId: string }) {
  const enLinea = useConexion();
  const { resumen, sinAlmacen, sincronizar } = useCola(usuarioId);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    registrarServiceWorker();
  }, []);

  const disparar = sincronizar.mutate;
  const hayQueSincronizar = resumen.enCola > 0;

  // Vuelve la conexión y hay cola: se manda. `disparar` es estable —es el
  // `mutate` de TanStack, no el objeto de la mutación—, y depender del objeto
  // fue exactamente el bug que hizo que el ingreso se disparara dieciséis veces.
  useEffect(() => {
    if (!enLinea || !hayQueSincronizar) return;
    disparar();
  }, [disparar, enLinea, hayQueSincronizar]);

  // El efecto de arriba corre cuando cambian sus dependencias, y si el envío
  // falla no cambia ninguna: sin este intervalo, una cola que falló una vez se
  // quedaría esperando a que alguien recargue la página.
  useEffect(() => {
    if (!hayQueSincronizar) return;
    const temporizador = setInterval(() => {
      if (hayConexion()) disparar();
    }, ESPERA_ENTRE_INTENTOS_MS);
    return () => clearInterval(temporizador);
  }, [disparar, hayQueSincronizar]);

  const insignias = [];

  if (!enLinea) {
    insignias.push(
      <Insignia key="conexion" tono="advertencia">
        Sin conexión
      </Insignia>,
    );
  }

  if (sinAlmacen) {
    insignias.push(
      <Insignia key="almacen" tono="error">
        Sin modo offline
      </Insignia>,
    );
  }

  if (sincronizar.isPending) {
    insignias.push(
      <Insignia key="sincronizando" tono="info">
        Sincronizando…
      </Insignia>,
    );
  } else if (resumen.enCola > 0) {
    insignias.push(
      <Insignia key="cola" tono="advertencia">
        {resumen.enCola} sin sincronizar
      </Insignia>,
    );
  }

  if (resumen.rechazadas > 0) {
    insignias.push(
      <Insignia key="rechazadas" tono="error">
        {resumen.rechazadas} rechazada{resumen.rechazadas === 1 ? '' : 's'}
      </Insignia>,
    );
  }

  if (resumen.deOtroUsuario > 0) {
    insignias.push(
      <Insignia key="ajenas" tono="neutro">
        {resumen.deOtroUsuario} de otro turno
      </Insignia>,
    );
  }

  if (insignias.length === 0) return null;

  return (
    <Link
      href="/pendientes"
      aria-label="Ver las ventas sin sincronizar"
      className="flex items-center gap-2 rounded-sm px-1 hover:bg-superficie-alta"
    >
      {insignias}
    </Link>
  );
}
