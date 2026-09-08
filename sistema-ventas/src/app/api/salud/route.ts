/**
 * ¿Se llega al servidor?
 *
 * Es el único endpoint sin sesión, y a propósito no toca la base ni devuelve
 * nada: la pregunta que contesta es de transporte, no de datos. Si pidiera
 * sesión, un cajero deslogueado vería "sin conexión" teniendo internet, que es
 * justo la confusión que este endpoint existe para evitar.
 *
 * Lo consulta `src/lib/offline/conexion.ts` mientras está sin conexión, para
 * enterarse de que la red volvió sin tener que esperar a que alguien cobre.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  });
}
