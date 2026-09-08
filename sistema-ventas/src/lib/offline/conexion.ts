/**
 * ¿Se llega al servidor?
 *
 * ⚠️ `navigator.onLine` no contesta esa pregunta. Contesta otra: si la placa de
 * red tiene un cable enchufado. Una PC conectada al router del local, con el
 * módem caído, informa `onLine === true` todo el día. En un mostrador eso es
 * peor que no tener nada: la pantalla diría "hay conexión" mientras cada venta
 * falla.
 *
 * Acá la verdad es otra: **la última petición que salió**. Si una llamada a la
 * API no llegó, se está sin conexión aunque el sistema operativo diga lo
 * contrario; si cualquier respuesta vuelve, se está en línea. Los eventos del
 * navegador se usan solo como aviso para ir a comprobar, nunca como respuesta.
 *
 * El sondeo a `/api/salud` existe para el camino de vuelta: sin él, estando sin
 * conexión no sale ninguna petición, y sin peticiones nunca se enteraría de que
 * la red volvió.
 */

const RUTA_SALUD = '/api/salud';
const ESPERA_ENTRE_SONDEOS_MS = 10_000;

type Escucha = () => void;

const escuchas = new Set<Escucha>();
let enLinea = true;
let sondeoProgramado: ReturnType<typeof setTimeout> | null = null;

function avisar(): void {
  for (const escucha of escuchas) escucha();
}

function fijar(valor: boolean): void {
  if (enLinea === valor) return;
  enLinea = valor;
  if (!enLinea) programarSondeo();
  avisar();
}

/** La llama el cliente HTTP cuando una respuesta vuelve, sea cual sea. */
export function marcarAlcanzable(): void {
  fijar(true);
}

/** La llama el cliente HTTP cuando el `fetch` ni siquiera llegó a responder. */
export function marcarInalcanzable(): void {
  fijar(false);
}

export function hayConexion(): boolean {
  return enLinea;
}

export function suscribirseAConexion(escucha: Escucha): () => void {
  escuchas.add(escucha);
  return () => {
    escuchas.delete(escucha);
  };
}

async function sondear(): Promise<void> {
  try {
    const respuesta = await fetch(RUTA_SALUD, { method: 'GET', cache: 'no-store' });
    if (respuesta.ok) {
      fijar(true);
      return;
    }
  } catch {
    // Sigue sin llegar. Se vuelve a intentar más abajo.
  }
  fijar(false);
  programarSondeo();
}

function programarSondeo(): void {
  if (typeof window === 'undefined') return;
  if (sondeoProgramado !== null) return;
  sondeoProgramado = setTimeout(() => {
    sondeoProgramado = null;
    void sondear();
  }, ESPERA_ENTRE_SONDEOS_MS);
}

/** Comprobación a pedido: la usa el botón "Reintentar ahora". */
export function comprobarConexion(): Promise<void> {
  return sondear();
}

if (typeof window !== 'undefined') {
  enLinea = window.navigator.onLine;

  // `online` no se cree, se verifica: dice que hay red, no que haya servidor.
  window.addEventListener('online', () => void sondear());
  // `offline`, en cambio, sí es concluyente: sin placa no hay a dónde llegar.
  window.addEventListener('offline', () => fijar(false));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !enLinea) void sondear();
  });

  if (!enLinea) programarSondeo();
}
