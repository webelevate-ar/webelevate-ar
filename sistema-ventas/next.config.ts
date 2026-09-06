import type { NextConfig } from 'next';

/**
 * Las cabeceras van acá y no en un proxy porque el proyecto se despliega como
 * una sola aplicación: si vivieran en la configuración del hosting, cambiar de
 * hosting las perdería sin que nadie se entere.
 */
const cabecerasSeguridad = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next inyecta estilos y scripts en línea; sin esto la aplicación no arranca.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * `better-sqlite3` es una extensión nativa y busca su `.node` con rutas
   * relativas a su propio archivo. Si webpack lo empaqueta dentro de un chunk,
   * esas rutas dejan de existir y la aplicación arranca bien pero revienta en
   * la primera consulta con "Could not locate the bindings file".
   *
   * Pasó de verdad: el `build` compiló limpio y la aplicación servida devolvía
   * error 500 en todos los endpoints. Que compile no prueba que funcione.
   */
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3'],
  async headers() {
    return [{ source: '/:path*', headers: cabecerasSeguridad }];
  },
};

export default nextConfig;
