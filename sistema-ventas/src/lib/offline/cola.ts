import type { MetodoPago, Unidad } from '../validacion/enums';

/**
 * La cola de ventas cobradas sin conexión: qué se guarda y qué se hace con
 * cada fallo. Todo lo de este archivo es lógica pura, sin IndexedDB ni red,
 * para poder probar con tests lo que decide el destino de una venta cobrada.
 *
 * Lo que hay que tener presente al leerlo: **una venta que está acá ya se le
 * cobró a alguien**. La plata está en el cajón y el cliente se fue. Ninguna
 * rama de este archivo puede terminar en "se descarta y no se avisa".
 */

export type EstadoPendiente = 'en_cola' | 'rechazada';

export interface ItemPendiente {
  productoId: string;
  nombre: string;
  unidad: Unidad;
  /** El del espejo del catálogo. El servidor lo va a recalcular al sincronizar. */
  precioUnitarioCentavos: number;
  cantidadMilesimas: number;
}

export interface PagoPendiente {
  metodo: MetodoPago;
  montoCentavos: number;
}

export interface VentaPendiente {
  /**
   * La misma que usa la venta en línea, y por eso reenviar es seguro: si el
   * pedido llegó al servidor y se perdió la respuesta, el reintento devuelve
   * aquella venta en lugar de cobrar de nuevo (§8.4).
   */
  claveIdempotencia: string;
  /**
   * Quién cobró. Una venta solo se sincroniza con la sesión de la persona que
   * la cobró: si sincronizara con la que esté logueada en ese momento, la venta
   * de un turno aparecería a nombre de otro cajero y en la caja equivocada.
   */
  usuarioId: string;
  usuarioNombre: string;
  cobradaEn: number;
  items: ItemPendiente[];
  pagos: PagoPendiente[];
  clienteId: string | null;
  /** Lo que se le cobró al cliente, con los precios del espejo. */
  totalCobradoCentavos: number;
  vueltoCentavos: number;
  intentos: number;
  estado: EstadoPendiente;
  ultimoError: string | null;
}

/**
 * Después de ocho intentos que el servidor rechaza por la misma razón, seguir
 * reintentando solo esconde el problema. La venta pasa a "rechazada", que no
 * es "descartada": queda en la lista, en rojo, hasta que alguien la resuelva.
 */
export const MAXIMO_INTENTOS = 8;

export type Veredicto = 'reintentar' | 'rechazar';

/**
 * Qué hacer con el fallo que devolvió el servidor.
 *
 * La división que importa es entre "esto se va a arreglar solo" y "esto no se
 * arregla esperando". Un corte de red se arregla solo. Un producto dado de baja
 * no: por más que se reintente mil veces va a fallar igual, y mientras tanto la
 * venta queda escondida en una cola que nadie mira.
 */
export function veredictoDelFallo(status: number, codigo: string): Veredicto {
  // Sin red no hay `status`. Es el caso normal del modo offline.
  if (status === 0) return 'reintentar';
  // El servidor está caído o sobrecargado: es transitorio por definición.
  if (status >= 500) return 'reintentar';
  if (status === 408 || status === 429) return 'reintentar';
  // La sesión venció. Se arregla cuando el cajero vuelve a ingresar.
  if (status === 401) return 'reintentar';
  // No hay caja abierta todavía. Se arregla cuando se abre.
  if (status === 409 && codigo === 'CAJA_CERRADA') return 'reintentar';
  return 'rechazar';
}

/**
 * El estado de la venta después de un intento fallido.
 *
 * Un fallo de red **no cuenta como intento**. Si contara, ocho horas sin
 * internet —que es justo para lo que existe el modo offline— darían por
 * rechazadas todas las ventas del turno sin que nadie hiciera nada mal.
 */
export function trasElFallo(
  venta: VentaPendiente,
  fallo: { status: number; codigo: string; mensaje: string },
): VentaPendiente {
  const veredicto = veredictoDelFallo(fallo.status, fallo.codigo);

  if (veredicto === 'rechazar') {
    return { ...venta, estado: 'rechazada', ultimoError: fallo.mensaje };
  }

  if (fallo.status === 0) {
    return { ...venta, ultimoError: fallo.mensaje };
  }

  const intentos = venta.intentos + 1;
  if (intentos >= MAXIMO_INTENTOS) {
    return {
      ...venta,
      intentos,
      estado: 'rechazada',
      ultimoError: `${fallo.mensaje} (se reintentó ${intentos} veces)`,
    };
  }
  return { ...venta, intentos, ultimoError: fallo.mensaje };
}

/**
 * Cuáles se mandan ahora y en qué orden.
 *
 * De la más vieja a la más nueva, para que los números de venta salgan en el
 * orden en que se cobraron. No es cosmético: el historial de un turno con los
 * números desordenados no se puede leer contra el rollo de la caja.
 */
export function ventasASincronizar(
  pendientes: readonly VentaPendiente[],
  usuarioId: string,
): VentaPendiente[] {
  return pendientes
    .filter((venta) => venta.estado === 'en_cola' && venta.usuarioId === usuarioId)
    .slice()
    .sort((una, otra) => una.cobradaEn - otra.cobradaEn);
}

export interface ResumenCola {
  enCola: number;
  rechazadas: number;
  /** En cola pero de otra persona: no las puede sincronizar quien está ahora. */
  deOtroUsuario: number;
  totalCentavos: number;
}

export function resumirCola(
  pendientes: readonly VentaPendiente[],
  usuarioId: string | null,
): ResumenCola {
  let enCola = 0;
  let rechazadas = 0;
  let deOtroUsuario = 0;
  let totalCentavos = 0;

  for (const venta of pendientes) {
    totalCentavos += venta.totalCobradoCentavos;
    if (venta.estado === 'rechazada') {
      rechazadas += 1;
      continue;
    }
    if (usuarioId !== null && venta.usuarioId !== usuarioId) {
      deOtroUsuario += 1;
      continue;
    }
    enCola += 1;
  }

  return { enCola, rechazadas, deOtroUsuario, totalCentavos };
}
