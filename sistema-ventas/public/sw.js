/**
 * Service worker: que la aplicación abra sin conexión.
 *
 * Sin esto, el modo offline no existe. La cola de ventas y el espejo del
 * catálogo están en IndexedDB, pero si al recargar la pestaña el navegador no
 * puede bajar el HTML y el JavaScript, no hay pantalla donde vender y esos
 * datos no los ve nadie. Este archivo resuelve solo eso: servir la aplicación
 * desde el disco cuando la red no está.
 *
 * Tres reglas y ninguna excepción:
 *
 *   1. `/api/*` **nunca** se cachea. Los datos los maneja la aplicación, que
 *      sabe cuáles pueden estar viejos y cuáles no. Un service worker sirviendo
 *      un stock de ayer como si fuera de ahora es peor que un error.
 *   2. Lo de `/_next/static/` sí, y de entrada: esas URL llevan un hash del
 *      contenido, así que una URL siempre devuelve exactamente lo mismo. Es el
 *      único caso donde cachear para siempre es correcto por construcción.
 *   3. La navegación va primero a la red y usa el disco solo si la red falla.
 *      Al revés, un despliegue nuevo tardaría en verse.
 *
 * Las páginas guardadas incluyen el nombre de quien tenía la sesión abierta
 * (está en la barra de navegación), así que al salir se borran: la caja es una
 * PC compartida entre turnos. Lo hace `limpiarPaginas` desde la aplicación.
 */

const VERSION = 'v1';
const CACHE_ESTATICO = `estatico-${VERSION}`;
const CACHE_PAGINAS = `paginas-${VERSION}`;
const MIOS = [CACHE_ESTATICO, CACHE_PAGINAS];

/** La única pantalla que tiene sentido abrir sin conexión. */
const PAGINA_BASE = '/venta';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_PAGINAS);
      try {
        const respuesta = await fetch(PAGINA_BASE, { credentials: 'same-origin' });
        // `redirected` importa: sin sesión, /venta responde con la pantalla de
        // ingreso. Guardar eso dejaría la caja mostrando el login para siempre.
        if (respuesta.ok && !respuesta.redirected) {
          await cache.put(PAGINA_BASE, respuesta.clone());
        }
      } catch {
        // Se instaló sin red. No es un error: se llena en la primera visita.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(nombres.filter((nombre) => !MIOS.includes(nombre)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.tipo === 'limpiar-paginas') {
    evento.waitUntil(caches.delete(CACHE_PAGINAS));
  }
});

function esEstatico(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname === '/icono.svg';
}

async function desdeCacheOEnRed(pedido, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardado = await cache.match(pedido);
  if (guardado) return guardado;

  const respuesta = await fetch(pedido);
  if (respuesta.ok) await cache.put(pedido, respuesta.clone());
  return respuesta;
}

async function desdeRedOEnCache(pedido) {
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok && !respuesta.redirected) await cache.put(pedido, respuesta.clone());
    return respuesta;
  } catch (fallo) {
    const guardado = (await cache.match(pedido)) ?? (await cache.match(PAGINA_BASE));
    if (guardado) return guardado;
    throw fallo;
  }
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  // Regla 1: la API no se cachea nunca, ni siquiera para leer.
  if (url.pathname.startsWith('/api/')) return;

  if (esEstatico(url)) {
    evento.respondWith(desdeCacheOEnRed(pedido, CACHE_ESTATICO));
    return;
  }

  // Navegación completa (F5, escribir la URL) y también la carga que hace el
  // router de Next al cambiar de pantalla, que viaja como GET con `_rsc`.
  if (pedido.mode === 'navigate' || url.searchParams.has('_rsc')) {
    evento.respondWith(desdeRedOEnCache(pedido));
  }
});
