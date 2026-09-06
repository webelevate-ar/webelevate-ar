import { describe, expect, it } from 'vitest';
import {
  formatearCantidad,
  formatearDiaMes,
  formatearDiferencia,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
  formatearMoneda,
  formatearMonedaRedonda,
  formatearNumeroVenta,
  formatearPorcentaje,
  normalizarParaBuscar,
} from '@/lib/formato';

/**
 * El formato entra en los tests porque un error acá se ve en el ticket y en el
 * cartel del vuelto, que es lo que el cliente mira.
 *
 * Las comparaciones normalizan el espacio duro que mete `Intl`: si no, el test
 * fallaría por un carácter invisible.
 */

describe('formatearMoneda', () => {
  it('pesos con dos decimales', () => {
    expect(formatearMoneda(123_456)).toBe('$ 1.234,56');
  });

  it('cero', () => {
    expect(formatearMoneda(0)).toBe('$ 0,00');
  });

  it('negativo', () => {
    expect(formatearMoneda(-123_456)).toBe('-$ 1.234,56');
  });

  it('millones con separador de miles', () => {
    expect(formatearMoneda(1_234_567_890)).toBe('$ 12.345.678,90');
  });
});

describe('formatearMonedaRedonda', () => {
  it('sin centavos, para botones y tarjetas', () => {
    expect(formatearMonedaRedonda(1_000_000)).toBe('$ 10.000');
    expect(formatearMonedaRedonda(123_456)).toBe('$ 1.234');
  });
});

describe('formatearDiferencia', () => {
  it('el signo se muestra siempre, también el más', () => {
    expect(formatearDiferencia(150_000)).toBe('+$ 1.500,00');
    expect(formatearDiferencia(-150_000)).toBe('−$ 1.500,00');
    expect(formatearDiferencia(0)).toBe('$ 0,00');
  });
});

describe('formatearCantidad', () => {
  it('kilos con tres decimales', () => {
    expect(formatearCantidad(1250, 'kg')).toBe('1,250 kg');
    expect(formatearCantidad(125, 'kg')).toBe('0,125 kg');
    expect(formatearCantidad(0, 'kg')).toBe('0,000 kg');
  });

  it('unidades sin decimales', () => {
    expect(formatearCantidad(3000, 'unidad')).toBe('3 u');
    expect(formatearCantidad(1000, 'unidad')).toBe('1 u');
    expect(formatearCantidad(0, 'unidad')).toBe('0 u');
  });

  it('una fracción de unidad va con coma, no con punto', () => {
    // Se leía "5.6 u" y en castellano eso se lee como cinco mil seiscientos.
    expect(formatearCantidad(5600, 'unidad')).toBe('5,6 u');
    expect(formatearCantidad(1250, 'unidad')).toBe('1,25 u');
  });

  it('unidades negativas, como en un ajuste', () => {
    expect(formatearCantidad(-3000, 'unidad')).toBe('-3 u');
    expect(formatearCantidad(-500, 'unidad')).toBe('-0,5 u');
  });

  it('kilos negativos, como en una merma', () => {
    expect(formatearCantidad(-1250, 'kg')).toBe('-1,250 kg');
    // Entre −1 y 0 el signo se perdía al truncar: -0,350 daba "0,350 kg".
    expect(formatearCantidad(-350, 'kg')).toBe('-0,350 kg');
  });
});

describe('formatearPorcentaje', () => {
  it('porcentaje entero', () => {
    expect(formatearPorcentaje(1000)).toBe('10 %');
  });

  it('con decimales', () => {
    expect(formatearPorcentaje(1250)).toBe('12,5 %');
  });

  it('cero', () => {
    expect(formatearPorcentaje(0)).toBe('0 %');
  });

  it('negativo, como un margen en pérdida', () => {
    expect(formatearPorcentaje(-2000)).toBe('-20 %');
  });
});

describe('formatearNumeroVenta', () => {
  it('siempre siete dígitos, para que la columna no baile', () => {
    expect(formatearNumeroVenta(1)).toBe('0000001');
    expect(formatearNumeroVenta(1234)).toBe('0001234');
    expect(formatearNumeroVenta(12_345_678)).toBe('12345678');
  });
});

describe('fechas', () => {
  const momento = new Date(2026, 8, 6, 19, 5, 0);

  it('fecha corta', () => {
    expect(formatearFecha(momento)).toBe('06/09/2026');
  });

  it('fecha con hora', () => {
    expect(formatearFechaHora(momento)).toBe('06/09/2026, 19:05');
  });

  it('solo la hora', () => {
    expect(formatearHora(momento)).toBe('19:05');
  });

  it('día y mes, para el eje del gráfico', () => {
    expect(formatearDiaMes(momento)).toContain('06');
  });
});

describe('normalizarParaBuscar', () => {
  it('saca acentos', () => {
    expect(normalizarParaBuscar('Almíbar')).toBe('almibar');
    expect(normalizarParaBuscar('Lácteos')).toBe('lacteos');
  });

  it('pasa a minúsculas y saca los espacios de los bordes', () => {
    expect(normalizarParaBuscar('  YERBA MATE  ')).toBe('yerba mate');
  });

  it('la ñ pasa a n, a propósito: el que escribe rápido pone "canuelas"', () => {
    // El `nombreBusqueda` del producto se guarda con esta misma función, así
    // que las dos formas de escribirlo encuentran el mismo producto.
    expect(normalizarParaBuscar('Cañuelas')).toBe('canuelas');
    expect(normalizarParaBuscar('canuelas')).toBe('canuelas');
  });
});
