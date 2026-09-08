/**
 * El trato con el service worker, del lado de la aplicación.
 *
 * Está en `lib` y no dentro del componente porque lo usan dos lugares que no se
 * conocen: el que lo registra al entrar y el que le pide borrar las páginas al
 * salir.
 */

const RUTA = '/sw.js';

export function registrarServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(RUTA, { scope: '/' }).catch((error: unknown) => {
    // Que no se registre no rompe nada con conexión: se pierde el modo offline
    // y hay que poder saberlo, así que se avisa en vez de tragárselo.
    console.warn('No se pudo registrar el service worker.', error);
  });
}

/**
 * Al salir, se tiran las páginas guardadas.
 *
 * La caja es una PC compartida entre turnos y el HTML cacheado tiene adentro el
 * nombre de quien tenía la sesión abierta —lo pinta la barra de navegación—.
 * Sin esto, el cajero del turno siguiente vería el nombre del anterior al abrir
 * sin conexión.
 */
export function limpiarPaginasGuardadas(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.controller?.postMessage({ tipo: 'limpiar-paginas' });
}
