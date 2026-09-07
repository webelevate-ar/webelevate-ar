import { calcularMargenCentesimas } from '../dinero';
import * as repoPanel from '../repositorios/panel';
import * as repoProductos from '../repositorios/productos';

/**
 * Panel del dueño. Es lo que compra él, así que las comparaciones se hacen
 * siempre contra el período anterior del mismo largo: un número solo no dice
 * nada, "$180.000, un 12 % menos que ayer" sí.
 */

export interface ResumenPanel {
  hoy: { ventas: number; totalCentavos: number; ticketPromedioCentavos: number };
  ayer: { ventas: number; totalCentavos: number; ticketPromedioCentavos: number };
  variacionCentesimas: number | null;
  margenCentesimas: number;
  porDia: repoPanel.TotalDelDia[];
  porHora: repoPanel.VentaPorHora[];
  porMetodo: repoPanel.TotalPorMetodo[];
  ranking: repoPanel.ProductoDelRanking[];
  productosBajoMinimo: number;
}

export async function resumen(dias = 30): Promise<ResumenPanel> {
  const inicioDeHoy = comienzoDelDia(new Date());
  const inicioDeAyer = new Date(inicioDeHoy.getTime() - 86_400_000);
  const desde = new Date(inicioDeHoy.getTime() - dias * 86_400_000);

  const [hoy, ayer, porDiaYHora, porMetodo, ranking, margen, bajoMinimo] = await Promise.all([
    repoPanel.resumenEntre(inicioDeHoy, new Date(inicioDeHoy.getTime() + 86_400_000)),
    repoPanel.resumenEntre(inicioDeAyer, inicioDeHoy),
    repoPanel.totalesPorDiaYHora(desde),
    repoPanel.totalesPorMetodo(desde),
    repoPanel.rankingProductos(desde),
    repoPanel.margenEntre(desde, new Date()),
    repoProductos.contarBajoMinimo(),
  ]);

  return {
    hoy: conTicketPromedio(hoy),
    ayer: conTicketPromedio(ayer),
    variacionCentesimas: variacion(ayer.totalCentavos, hoy.totalCentavos),
    margenCentesimas: calcularMargenCentesimas(margen.ventaCentavos, margen.costoCentavos),
    porDia: porDiaYHora.porDia,
    porHora: porDiaYHora.porHora,
    porMetodo,
    ranking,
    productosBajoMinimo: bajoMinimo,
  };
}

function conTicketPromedio(datos: { ventas: number; totalCentavos: number }) {
  return {
    ventas: datos.ventas,
    totalCentavos: datos.totalCentavos,
    ticketPromedioCentavos: datos.ventas === 0 ? 0 : Math.round(datos.totalCentavos / datos.ventas),
  };
}

/**
 * Devuelve `null` cuando la base es cero: dividir por cero daría Infinity y en
 * pantalla se leería "+∞ %", que es peor que no mostrar nada.
 */
function variacion(anterior: number, actual: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 10_000);
}

function comienzoDelDia(fecha: Date): Date {
  const copia = new Date(fecha);
  copia.setHours(0, 0, 0, 0);
  return copia;
}
