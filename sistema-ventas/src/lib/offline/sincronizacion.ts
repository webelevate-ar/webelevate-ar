import { api, ErrorDeApi } from '../cliente-api';
import { borrarPendiente, guardarPendiente, listarPendientes } from './almacen';
import { hayConexion } from './conexion';
import { trasElFallo, ventasASincronizar, type VentaPendiente } from './cola';

/**
 * El envío de ventas al servidor, con o sin conexión.
 *
 * Todo este archivo se apoya en una sola propiedad: **la clave de idempotencia
 * hace que reenviar sea gratis**. El servidor, si ya vio esa clave, devuelve la
 * venta que creó en lugar de crear otra (§8.4). Sin eso, cada reintento de acá
 * sería un cobro doble, y no habría forma de distinguir "no llegó" de "llegó y
 * se perdió la respuesta".
 */

export interface VentaCreada {
  venta: {
    id: string;
    numero: number;
    totalCentavos: number;
    pagos: { metodo: string; montoCentavos: number; vueltoCentavos: number }[];
  };
  yaExistia: boolean;
}

/** Lo que solo existe cuando hay conexión: nada de esto se guarda en la cola. */
export interface ExtrasEnLinea {
  descuentoPorcentajeCentesimas: number;
  pinSupervisor: string | null;
}

function itemsDe(venta: VentaPendiente) {
  return venta.items.map((item) => ({
    productoId: item.productoId,
    cantidadMilesimas: item.cantidadMilesimas,
  }));
}

/** El cobro normal, con el servidor del otro lado. */
function cuerpoEnLinea(venta: VentaPendiente, extras: ExtrasEnLinea) {
  return {
    claveIdempotencia: venta.claveIdempotencia,
    items: itemsDe(venta),
    pagos: venta.pagos,
    descuentoPorcentajeCentesimas: extras.descuentoPorcentajeCentesimas,
    clienteId: venta.clienteId,
    pinSupervisor: extras.pinSupervisor,
    cobradaSinConexionEn: null,
    totalCobradoCentavos: null,
  };
}

/**
 * El cobro que estuvo en la cola.
 *
 * Va sin descuento y sin PIN, y no es un olvido: sin conexión no hay forma de
 * verificar el PIN del supervisor, y guardarlo en el navegador para reenviarlo
 * más tarde sería dejar el PIN de un supervisor escrito en el disco de la caja.
 * Por eso `cobrarOEncolar` no deja encolar una venta con descuento.
 */
function cuerpoDeLaCola(venta: VentaPendiente) {
  return {
    claveIdempotencia: venta.claveIdempotencia,
    items: itemsDe(venta),
    pagos: venta.pagos,
    descuentoPorcentajeCentesimas: 0,
    clienteId: venta.clienteId,
    pinSupervisor: null,
    cobradaSinConexionEn: new Date(venta.cobradaEn).toISOString(),
    totalCobradoCentavos: venta.totalCobradoCentavos,
  };
}

/**
 * ¿Este fallo justifica guardar la venta en la cola en vez de mostrarle el
 * error al cajero?
 *
 * Solo cuando el problema es del transporte o del servidor. Un 4xx —producto
 * dado de baja, caja cerrada, pagos que no cubren el total— hay que mostrarlo
 * **ahora**, con el cliente todavía en el mostrador: encolarlo lo escondería
 * hasta que ya no se pueda arreglar.
 */
function convieneEncolar(error: unknown): boolean {
  if (!(error instanceof ErrorDeApi)) return false;
  return error.status === 0 || error.status >= 500;
}

export type ModoDeCobro = 'cobrada' | 'encolada';

export interface ResultadoCobro {
  modo: ModoDeCobro;
  venta: VentaCreada['venta'] | null;
}

export class ErrorDeCola extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeCola';
  }
}

/**
 * Cobra. Si no se llega al servidor, la venta queda en la cola local.
 *
 * Cuando ya se sabe que no hay conexión, ni se intenta: esperar el tiempo de
 * espera de un `fetch` con gente en la fila es tiempo perdido a propósito.
 */
export async function cobrarOEncolar(
  venta: VentaPendiente,
  extras: ExtrasEnLinea,
): Promise<ResultadoCobro> {
  if (!hayConexion()) {
    await encolar(venta, extras);
    return { modo: 'encolada', venta: null };
  }

  try {
    const respuesta = await api.post<VentaCreada>('/api/ventas', cuerpoEnLinea(venta, extras));
    return { modo: 'cobrada', venta: respuesta.venta };
  } catch (error) {
    if (!convieneEncolar(error)) throw error;
    await encolar(venta, extras);
    return { modo: 'encolada', venta: null };
  }
}

/**
 * Guardar en la cola tiene que fallar ruidosamente.
 *
 * Si IndexedDB no guardó y la pantalla igual mostrara el vuelto, la venta se
 * evapora: no está en el servidor ni en el navegador, y nadie se entera hasta
 * el arqueo. Por eso esto lanza en lugar de devolver `false`.
 */
async function encolar(venta: VentaPendiente, extras: ExtrasEnLinea): Promise<void> {
  if (extras.descuentoPorcentajeCentesimas > 0) {
    throw new ErrorDeCola(
      'Sin conexión no se puede aplicar un descuento: el PIN del supervisor lo verifica el ' +
        'servidor, y guardarlo en esta PC para mandarlo después no es una opción. Sacá el ' +
        'descuento con F8 y cobrá, o esperá a que vuelva la conexión.',
    );
  }

  const guardada = await guardarPendiente(venta);
  if (!guardada) {
    throw new ErrorDeCola(
      'No hay conexión y tampoco se pudo guardar la venta en esta PC. No cobres: ' +
        'anotá la venta a mano y avisá. (Suele pasar en ventana de incógnito o con el disco lleno.)',
    );
  }
}

export interface ResumenSincronizacion {
  /** `false` cuando no se pudo leer la cola. No es lo mismo que "no había". */
  leida: boolean;
  enviadas: number;
  /** Ya estaban en el servidor: el pedido anterior sí había llegado. */
  yaExistian: number;
  rechazadas: number;
  restantes: number;
}

const VACIO: ResumenSincronizacion = {
  leida: true,
  enviadas: 0,
  yaExistian: 0,
  rechazadas: 0,
  restantes: 0,
};

let sincronizando = false;

/**
 * Vacía la cola contra el servidor.
 *
 * **De a una y en orden de cobro.** En paralelo sería más rápido y peor: la
 * creación de una venta corre con aislamiento `Serializable`, así que dos a la
 * vez se abortan entre sí y se comen los reintentos (ver `reintentos.ts`), y
 * además los números de venta saldrían desordenados contra el rollo de la caja.
 *
 * Al primer fallo de red corta: si no se llega al servidor, insistir con las
 * veinte que siguen es tiempo perdido.
 */
export async function sincronizarCola(usuarioId: string): Promise<ResumenSincronizacion> {
  if (sincronizando) return VACIO;
  sincronizando = true;

  try {
    const pendientes = await listarPendientes();
    if (pendientes === null) return { ...VACIO, leida: false };

    const aEnviar = ventasASincronizar(pendientes, usuarioId);
    let enviadas = 0;
    let yaExistian = 0;
    let rechazadas = 0;
    let cortado = false;

    for (const venta of aEnviar) {
      if (cortado) break;
      try {
        const respuesta = await api.post<VentaCreada>('/api/ventas', cuerpoDeLaCola(venta));
        if (respuesta.yaExistia) yaExistian += 1;
        else enviadas += 1;
        await borrarPendiente(venta.claveIdempotencia);
      } catch (error) {
        const fallo =
          error instanceof ErrorDeApi
            ? { status: error.status, codigo: error.codigo, mensaje: error.message }
            : {
                status: 0,
                codigo: 'DESCONOCIDO',
                mensaje: error instanceof Error ? error.message : 'Falló el envío',
              };

        const actualizada = trasElFallo(venta, fallo);
        await guardarPendiente(actualizada);
        if (actualizada.estado === 'rechazada') rechazadas += 1;
        if (fallo.status === 0) cortado = true;
      }
    }

    const quedan = await listarPendientes();
    return {
      leida: true,
      enviadas,
      yaExistian,
      rechazadas,
      restantes: quedan?.length ?? 0,
    };
  } finally {
    sincronizando = false;
  }
}

/** Devuelve una venta rechazada a la cola, para volver a intentarla a mano. */
export async function reencolar(venta: VentaPendiente): Promise<boolean> {
  return guardarPendiente({ ...venta, estado: 'en_cola', intentos: 0, ultimoError: null });
}

export { borrarPendiente, listarPendientes };
