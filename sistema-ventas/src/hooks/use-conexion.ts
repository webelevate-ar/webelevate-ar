'use client';

import { useSyncExternalStore } from 'react';
import { hayConexion, suscribirseAConexion } from '@/lib/offline/conexion';

/**
 * ¿Se llega al servidor? La lógica está en `lib/offline/conexion.ts`; esto solo
 * la conecta a React.
 *
 * `useSyncExternalStore` y no un `useState` con listeners: el estado puede
 * cambiar entre que React lee y que pinta —una petición que falla en medio de
 * un render— y esta API es la que garantiza que no se muestre un valor viejo.
 * El tercer argumento es el que devuelve el render del servidor, donde no hay
 * navegador ni conexión que consultar: se asume en línea y se corrige al
 * hidratar.
 */
export function useConexion(): boolean {
  return useSyncExternalStore(suscribirseAConexion, hayConexion, () => true);
}
