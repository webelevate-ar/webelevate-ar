/**
 * Aritmética de dinero. Es el archivo más importante del proyecto.
 *
 * Todo monto es un entero de centavos. Nunca `float`, nunca un `Number` con
 * decimales, nunca `parseFloat`. Un solo redondeo mal puesto y el arqueo da mal
 * por un centavo todos los días del mes, y nadie encuentra dónde.
 *
 * Las cantidades siguen la misma idea: se guardan en milésimas de unidad
 * (enteros). 1 unidad = 1000; 1,250 kg = 1250. Así "1,1 kg × 3" no arrastra el
 * error de coma flotante que tendría 1.1 * 3.
 */

export const MILESIMAS_POR_UNIDAD = 1000;

/** Máximo razonable para un monto en centavos: mil millones de pesos. */
const LIMITE_CENTAVOS = 100_000_000_000;

export class ErrorDinero extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDinero';
  }
}

function exigirEntero(valor: number, nombre: string): number {
  if (!Number.isInteger(valor)) {
    throw new ErrorDinero(`${nombre} tiene que ser un entero, llegó ${valor}`);
  }
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorDinero(`${nombre} se pasó del rango seguro de enteros`);
  }
  return valor;
}

/**
 * Redondeo comercial: la mitad se va para arriba en valor absoluto.
 * 0,5 → 1 y −0,5 → −1. Lo simétrico importa porque las anulaciones generan
 * los mismos montos en negativo y tienen que cancelarse exactamente.
 */
export function redondearMitadArriba(valor: number): number {
  if (!Number.isFinite(valor)) throw new ErrorDinero('No se puede redondear un valor no finito');
  return valor < 0 ? -Math.round(-valor) : Math.round(valor);
}

/** Suma montos en centavos. Existe para no escribir `reduce` en cinco lugares. */
export function sumarCentavos(...montos: number[]): number {
  let total = 0;
  for (const monto of montos) total += exigirEntero(monto, 'monto');
  return exigirEntero(total, 'total');
}

/**
 * Precio unitario × cantidad, en centavos.
 * Es la única multiplicación de dinero del sistema: si el redondeo se hace en
 * otro lado, dos pantallas muestran totales distintos.
 */
export function multiplicarPorCantidad(
  precioUnitarioCentavos: number,
  cantidadMilesimas: number,
): number {
  exigirEntero(precioUnitarioCentavos, 'precioUnitarioCentavos');
  exigirEntero(cantidadMilesimas, 'cantidadMilesimas');
  if (precioUnitarioCentavos < 0) throw new ErrorDinero('El precio no puede ser negativo');
  if (cantidadMilesimas < 0) throw new ErrorDinero('La cantidad no puede ser negativa');

  const bruto = (precioUnitarioCentavos * cantidadMilesimas) / MILESIMAS_POR_UNIDAD;
  const resultado = redondearMitadArriba(bruto);
  if (resultado > LIMITE_CENTAVOS) throw new ErrorDinero('El subtotal se pasó del límite');
  return resultado;
}

export interface ItemCalculable {
  precioUnitarioCentavos: number;
  cantidadMilesimas: number;
}

/** Suma de los subtotales de los ítems, cada uno redondeado antes de sumar. */
export function calcularSubtotal(items: readonly ItemCalculable[]): number {
  let total = 0;
  for (const item of items) {
    total += multiplicarPorCantidad(item.precioUnitarioCentavos, item.cantidadMilesimas);
  }
  return exigirEntero(total, 'subtotal');
}

/**
 * Descuento en puntos de porcentaje con dos decimales (1250 = 12,50 %).
 * En porcentaje y no en pesos porque es lo que el cajero teclea, y guardarlo
 * como porcentaje deja el monto reconstruible si mañana cambia el subtotal.
 */
export function calcularDescuentoPorPorcentaje(
  subtotalCentavos: number,
  porcentajeCentesimas: number,
): number {
  exigirEntero(subtotalCentavos, 'subtotalCentavos');
  exigirEntero(porcentajeCentesimas, 'porcentajeCentesimas');
  if (porcentajeCentesimas < 0 || porcentajeCentesimas > 10_000) {
    throw new ErrorDinero('El descuento tiene que estar entre 0 y 100 %');
  }
  return redondearMitadArriba((subtotalCentavos * porcentajeCentesimas) / 10_000);
}

/** Total de la venta. Nunca baja de cero, aunque el descuento se pase. */
export function calcularTotal(subtotalCentavos: number, descuentoCentavos: number): number {
  exigirEntero(subtotalCentavos, 'subtotalCentavos');
  exigirEntero(descuentoCentavos, 'descuentoCentavos');
  if (descuentoCentavos < 0) throw new ErrorDinero('El descuento no puede ser negativo');
  if (descuentoCentavos > subtotalCentavos) {
    throw new ErrorDinero('El descuento no puede superar al subtotal');
  }
  return subtotalCentavos - descuentoCentavos;
}

export interface PagoCalculable {
  metodo: string;
  montoCentavos: number;
}

/**
 * Vuelto. Solo el efectivo devuelve cambio: si alguien paga $10.000 en débito
 * por una compra de $8.000, la diferencia no es vuelto, es un error de carga.
 */
export function calcularVuelto(totalCentavos: number, pagos: readonly PagoCalculable[]): number {
  exigirEntero(totalCentavos, 'totalCentavos');
  if (totalCentavos < 0) throw new ErrorDinero('El total no puede ser negativo');

  let entregado = 0;
  let efectivo = 0;
  for (const pago of pagos) {
    exigirEntero(pago.montoCentavos, 'montoCentavos');
    if (pago.montoCentavos <= 0) throw new ErrorDinero('Cada pago tiene que ser mayor a cero');
    entregado += pago.montoCentavos;
    if (pago.metodo === 'efectivo') efectivo += pago.montoCentavos;
  }

  const sobrante = entregado - totalCentavos;
  if (sobrante < 0) {
    throw new ErrorDinero('Lo entregado no alcanza a cubrir el total');
  }
  if (sobrante > efectivo) {
    throw new ErrorDinero('Solo se puede dar vuelto sobre lo pagado en efectivo');
  }
  return sobrante;
}

/**
 * Cuánto entra en la caja por esta venta: el efectivo cobrado menos el vuelto.
 * Débito, crédito y QR no pasan por el cajón, así que no cuentan para el arqueo.
 */
export function efectivoNetoDeVenta(
  pagos: readonly PagoCalculable[],
  vueltoCentavos: number,
): number {
  exigirEntero(vueltoCentavos, 'vueltoCentavos');
  let efectivo = 0;
  for (const pago of pagos) if (pago.metodo === 'efectivo') efectivo += pago.montoCentavos;
  return efectivo - vueltoCentavos;
}

export interface EntradaArqueo {
  montoInicialCentavos: number;
  ventasEfectivoCentavos: number;
  ingresosCentavos: number;
  retirosCentavos: number;
  devolucionesEfectivoCentavos: number;
}

export interface ResultadoArqueo {
  esperadoCentavos: number;
  declaradoCentavos: number;
  diferenciaCentavos: number;
  /** Negativa = falta plata en el cajón. Es el número que mira el dueño. */
  falta: boolean;
  sobra: boolean;
}

/** Arqueo de caja. La diferencia es declarado − esperado: negativa es faltante. */
export function calcularArqueo(
  entrada: EntradaArqueo,
  declaradoCentavos: number,
): ResultadoArqueo {
  const esperado = sumarCentavos(
    entrada.montoInicialCentavos,
    entrada.ventasEfectivoCentavos,
    entrada.ingresosCentavos,
    -entrada.retirosCentavos,
    -entrada.devolucionesEfectivoCentavos,
  );
  exigirEntero(declaradoCentavos, 'declaradoCentavos');
  if (declaradoCentavos < 0) throw new ErrorDinero('El monto declarado no puede ser negativo');

  const diferencia = declaradoCentavos - esperado;
  return {
    esperadoCentavos: esperado,
    declaradoCentavos,
    diferenciaCentavos: diferencia,
    falta: diferencia < 0,
    sobra: diferencia > 0,
  };
}

/** Valorización de stock al precio de costo. */
export function valorizarStock(
  items: readonly { cantidadMilesimas: number; precioCostoCentavos: number }[],
): number {
  let total = 0;
  for (const item of items) {
    total += multiplicarPorCantidad(item.precioCostoCentavos, item.cantidadMilesimas);
  }
  return exigirEntero(total, 'valorización');
}

/** Margen en puntos de porcentaje con dos decimales (3500 = 35,00 %). */
export function calcularMargenCentesimas(
  precioVentaCentavos: number,
  precioCostoCentavos: number,
): number {
  exigirEntero(precioVentaCentavos, 'precioVentaCentavos');
  exigirEntero(precioCostoCentavos, 'precioCostoCentavos');
  if (precioVentaCentavos <= 0) return 0;
  return redondearMitadArriba(
    ((precioVentaCentavos - precioCostoCentavos) * 10_000) / precioVentaCentavos,
  );
}

const MONTO_VALIDO = /^\d{1,12}([.,]\d{0,2})?$/;

/**
 * Convierte lo que el cajero teclea a centavos, sin pasar por `parseFloat`.
 * Acepta "1234", "1234,5", "1234,56", "1.234,56" y "1,234.56".
 * Devuelve `null` si el texto no es un monto: la pantalla decide qué mostrar.
 */
export function parsearMontoACentavos(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '');
  if (limpio === '') return null;

  const sinSeparadores = quitarSeparadoresDeMiles(limpio);
  if (sinSeparadores === null || !MONTO_VALIDO.test(sinSeparadores)) return null;

  const [enteros = '0', decimales = ''] = sinSeparadores.split(/[.,]/);
  const centavos = decimales.padEnd(2, '0').slice(0, 2);
  // El máximo que deja pasar la expresión regular son 12 dígitos enteros:
  // 999.999.999.999 × 100 + 99 ≈ 1e14, muy por debajo del entero seguro (9e15).
  // Por eso acá no hace falta volver a comprobarlo.
  return Number(enteros) * 100 + Number(centavos);
}

const CANTIDAD_VALIDA = /^\d{1,6}([.,]\d{0,3})?$/;

/** Convierte "1,250" a 1250 milésimas. Mismo criterio que los montos. */
export function parsearCantidadAMilesimas(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, '');
  if (limpio === '') return null;

  const sinSeparadores = quitarSeparadoresDeMiles(limpio);
  if (sinSeparadores === null || !CANTIDAD_VALIDA.test(sinSeparadores)) return null;

  const [enteros = '0', decimales = ''] = sinSeparadores.split(/[.,]/);
  const milesimas = decimales.padEnd(3, '0').slice(0, 3);
  // Seis dígitos como máximo: 999.999 × 1000 + 999 ≈ 1e9. Igual que arriba,
  // la expresión regular ya lo acota y no hay nada más que verificar.
  return Number(enteros) * MILESIMAS_POR_UNIDAD + Number(milesimas);
}

/**
 * Saca los puntos o comas que separan miles y deja un solo separador decimal.
 * "1.234,56" y "1,234.56" son el mismo número escrito en dos convenciones, y
 * los dos llegan del mostrador según quién configuró el teclado.
 */
function quitarSeparadoresDeMiles(texto: string): string | null {
  const puntos = (texto.match(/\./g) ?? []).length;
  const comas = (texto.match(/,/g) ?? []).length;

  if (puntos === 0 && comas === 0) return texto;
  if (puntos > 0 && comas > 0) {
    // El último que aparece es el decimal; el otro separa miles.
    const ultimoPunto = texto.lastIndexOf('.');
    const ultimaComa = texto.lastIndexOf(',');
    const decimal = ultimoPunto > ultimaComa ? '.' : ',';
    const miles = decimal === '.' ? ',' : '.';
    return texto.split(miles).join('');
  }

  const separador = puntos > 0 ? '.' : ',';
  const partes = texto.split(separador);
  if (partes.length === 2) return texto;

  // Tres o más partes solo tiene sentido como separador de miles: 1.234.567
  if (partes.slice(1).every((parte) => parte.length === 3)) return partes.join('');
  return null;
}

/** Billetes que se ofrecen como atajo en el cobro en efectivo. */
export const BILLETES_SUGERIDOS_CENTAVOS = [100_000, 200_000, 500_000, 1_000_000] as const;
