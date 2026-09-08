import type { MetadataRoute } from 'next';

/**
 * El manifiesto de la PWA.
 *
 * Sirve para dos cosas concretas y no para más: que la caja pueda dejar el
 * sistema instalado como una ventana sin barra de direcciones —una tecla menos
 * para irse a otro lado sin querer— y que el navegador lo trate como una
 * aplicación con estado propio.
 *
 * Lo que **no** hace es el modo offline. Eso lo hacen el service worker
 * (`public/sw.js`) y el almacén local (`lib/offline/`). Un manifiesto sin
 * service worker es un ícono en el escritorio y nada más.
 *
 * El ícono es un SVG y alcanza para Chromium, que es el navegador de la PC de
 * mostrador del §2. Para que Android lo ofrezca en el menú de instalación
 * harían falta PNG de 192 y 512: no están, y no se dice que estén.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sistema de ventas',
    short_name: 'Ventas',
    description: 'Punto de venta para autoservicio y minimercado.',
    // Arranca en la pantalla de venta, no en la raíz: es la única que se usa
    // ocho horas por día.
    start_url: '/venta',
    scope: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0a0e13',
    theme_color: '#0a0e13',
    lang: 'es-AR',
    icons: [{ src: '/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
