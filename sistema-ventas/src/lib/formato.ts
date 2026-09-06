/**
 * Formato de datos. Una función por tipo y nada de formateo en línea (§7.6).
 *
 * Los formateadores de `Intl` se crean una sola vez: instanciarlos en cada
 * fila cuesta milisegundos que se notan al pintar una lista de 400 productos.
 */

import { MILESIMAS_POR_UNIDAD } from './dinero';

export type Unidad = 'unidad' | 'kg';

const LOCALE = 'es-AR';

const monedaCompleta = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const monedaSinCentavos = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const fechaCorta = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/*
 * `hour12: false` es obligatorio. Sin eso, `es-AR` devuelve "07:05 p. m." y en
 * un ticket y en un arqueo eso es peor que inútil: obliga a leer dos veces para
 * saber si una venta fue a la mañana o a la tarde.
 */
const fechaYHora = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const soloHora = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const diaYMes = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short' });

/**
 * `Intl` mete un espacio duro entre el signo y el número. Se reemplaza por uno
 * normal para que las pruebas comparen lo que se ve y no un carácter invisible.
 */
function normalizar(texto: string): string {
  return texto.replace(/ /g, ' ');
}

export function formatearMoneda(centavos: number): string {
  return normalizar(monedaCompleta.format(centavos / 100));
}

/** Para dashboards y botones de billete, donde ",00" es ruido. */
export function formatearMonedaRedonda(centavos: number): string {
  return normalizar(monedaSinCentavos.format(Math.trunc(centavos / 100)));
}

/** Diferencias de caja: el signo se muestra siempre, incluso el "+". */
export function formatearDiferencia(centavos: number): string {
  const signo = centavos > 0 ? '+' : centavos < 0 ? '−' : '';
  return `${signo}${formatearMoneda(Math.abs(centavos))}`;
}

export function formatearFecha(fecha: Date): string {
  return normalizar(fechaCorta.format(fecha));
}

export function formatearFechaHora(fecha: Date): string {
  return normalizar(fechaYHora.format(fecha));
}

export function formatearHora(fecha: Date): string {
  return normalizar(soloHora.format(fecha));
}

export function formatearDiaMes(fecha: Date): string {
  return normalizar(diaYMes.format(fecha));
}

/**
 * "1,250 kg" para lo que se pesa, "3 u" para lo que se cuenta.
 *
 * Lo que se cuenta casi siempre es entero, pero un ajuste puede dejar una
 * fracción y hay que poder mostrarla. Va con coma, como cualquier número de
 * acá: dividir y dejar que JavaScript lo imprima daba "5.6 u", con punto, que
 * en una pantalla en castellano se lee como cinco mil seiscientos.
 */
export function formatearCantidad(cantidadMilesimas: number, unidad: Unidad): string {
  const signo = cantidadMilesimas < 0 ? '-' : '';
  const absoluto = Math.abs(cantidadMilesimas);
  const entero = Math.trunc(absoluto / MILESIMAS_POR_UNIDAD);
  const resto = absoluto % MILESIMAS_POR_UNIDAD;

  if (unidad === 'kg') {
    return `${signo}${entero},${resto.toString().padStart(3, '0')} kg`;
  }
  if (resto === 0) return `${signo}${entero} u`;
  const decimales = resto.toString().padStart(3, '0').replace(/0+$/, '');
  return `${signo}${entero},${decimales} u`;
}

/** Porcentaje guardado en centésimas: 1250 → "12,5 %". */
export function formatearPorcentaje(centesimas: number): string {
  const valor = centesimas / 100;
  const texto = Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/0$/, '');
  return `${texto.replace('.', ',')} %`;
}

/** El número de venta se muestra siempre con el mismo ancho: 0000123. */
export function formatearNumeroVenta(numero: number): string {
  return numero.toString().padStart(7, '0');
}

/**
 * Saca acentos y pasa a minúsculas, para buscar "durazno" y que aparezca
 * "Duraznos en almíbar". El lector de códigos no los usa, pero el teclado sí.
 *
 * También convierte la ñ en n, y está bien que lo haga: el que escribe rápido
 * pone "canuelas". Como el `nombreBusqueda` del producto se genera con esta
 * misma función, los dos lados quedan iguales y "cañuelas" también encuentra.
 */
export function normalizarParaBuscar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
