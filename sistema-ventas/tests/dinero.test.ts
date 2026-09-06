import { describe, expect, it } from 'vitest';
import {
  BILLETES_SUGERIDOS_CENTAVOS,
  calcularArqueo,
  calcularDescuentoPorPorcentaje,
  calcularMargenCentesimas,
  calcularSubtotal,
  calcularTotal,
  calcularVuelto,
  efectivoNetoDeVenta,
  ErrorDinero,
  MILESIMAS_POR_UNIDAD,
  multiplicarPorCantidad,
  parsearCantidadAMilesimas,
  parsearMontoACentavos,
  redondearMitadArriba,
  sumarCentavos,
  valorizarStock,
} from '@/lib/dinero';

/**
 * La lógica de dinero, al 100 % (§9).
 *
 * Cada caso está por algo que puede pasar de verdad en el mostrador, no para
 * llenar la barra de cobertura.
 */

describe('redondearMitadArriba', () => {
  it('la mitad va para arriba', () => {
    expect(redondearMitadArriba(0.5)).toBe(1);
    expect(redondearMitadArriba(1.5)).toBe(2);
    expect(redondearMitadArriba(2.4)).toBe(2);
  });

  it('es simétrico con los negativos, para que la anulación cancele exacto', () => {
    expect(redondearMitadArriba(-0.5)).toBe(-1);
    expect(redondearMitadArriba(-1.5)).toBe(-2);
    // Con Math.round a secas, -0,5 daría 0 y la anulación dejaría un centavo colgado.
    expect(redondearMitadArriba(-2.5)).toBe(-3);
  });

  it('rechaza lo que no es finito', () => {
    expect(() => redondearMitadArriba(Number.NaN)).toThrow(ErrorDinero);
    expect(() => redondearMitadArriba(Number.POSITIVE_INFINITY)).toThrow(ErrorDinero);
  });
});

describe('sumarCentavos', () => {
  it('suma enteros', () => {
    expect(sumarCentavos(100, 250, -50)).toBe(300);
    expect(sumarCentavos()).toBe(0);
  });

  it('rechaza decimales: un centavo con coma es un bug, no un dato', () => {
    expect(() => sumarCentavos(10.5)).toThrow(ErrorDinero);
  });

  it('rechaza lo que se sale del rango seguro de enteros', () => {
    expect(() => sumarCentavos(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toThrow(
      ErrorDinero,
    );
  });
});

describe('multiplicarPorCantidad', () => {
  it('cantidades enteras', () => {
    expect(multiplicarPorCantidad(125_000, 3 * MILESIMAS_POR_UNIDAD)).toBe(375_000);
  });

  it('productos por peso', () => {
    // 1,250 kg a $8.500 el kilo = $10.625
    expect(multiplicarPorCantidad(850_000, 1250)).toBe(1_062_500);
  });

  it('redondea al centavo, sin arrastrar coma flotante', () => {
    // 0,333 kg × $10,00. En float sería 3.3299999999999996.
    expect(multiplicarPorCantidad(1000, 333)).toBe(333);
    // 1,1 × 3 en float da 3.3000000000000003; acá es exacto.
    expect(multiplicarPorCantidad(300, 1100)).toBe(330);
  });

  it('la mitad de centavo va para arriba', () => {
    // 0,005 kg × $1,00 = 0,5 centavos
    expect(multiplicarPorCantidad(100, 5)).toBe(1);
  });

  it('cantidad cero da cero', () => {
    expect(multiplicarPorCantidad(500_000, 0)).toBe(0);
  });

  it('rechaza precios y cantidades negativas', () => {
    expect(() => multiplicarPorCantidad(-100, 1000)).toThrow(ErrorDinero);
    expect(() => multiplicarPorCantidad(100, -1000)).toThrow(ErrorDinero);
  });

  it('rechaza decimales en cualquiera de los dos', () => {
    expect(() => multiplicarPorCantidad(100.5, 1000)).toThrow(ErrorDinero);
    expect(() => multiplicarPorCantidad(100, 1000.5)).toThrow(ErrorDinero);
  });

  it('rechaza un subtotal descomunal', () => {
    expect(() => multiplicarPorCantidad(100_000_000_000, 1000 * MILESIMAS_POR_UNIDAD)).toThrow(
      ErrorDinero,
    );
  });
});

describe('calcularSubtotal', () => {
  it('redondea cada línea antes de sumar', () => {
    // Si se sumara sin redondear, tres medios centavos darían 2 en vez de 3.
    const items = [
      { precioUnitarioCentavos: 100, cantidadMilesimas: 5 },
      { precioUnitarioCentavos: 100, cantidadMilesimas: 5 },
      { precioUnitarioCentavos: 100, cantidadMilesimas: 5 },
    ];
    expect(calcularSubtotal(items)).toBe(3);
  });

  it('un carrito vacío suma cero', () => {
    expect(calcularSubtotal([])).toBe(0);
  });

  it('un ticket de tres productos', () => {
    expect(
      calcularSubtotal([
        { precioUnitarioCentavos: 189_000, cantidadMilesimas: 1000 },
        { precioUnitarioCentavos: 245_500, cantidadMilesimas: 2000 },
        { precioUnitarioCentavos: 850_000, cantidadMilesimas: 350 },
      ]),
    ).toBe(189_000 + 491_000 + 297_500);
  });
});

describe('calcularDescuentoPorPorcentaje', () => {
  it('un 10 % sobre $1.000', () => {
    expect(calcularDescuentoPorPorcentaje(100_000, 1000)).toBe(10_000);
  });

  it('12,5 % con decimales', () => {
    expect(calcularDescuentoPorPorcentaje(100_000, 1250)).toBe(12_500);
  });

  it('0 % no descuenta nada', () => {
    expect(calcularDescuentoPorPorcentaje(100_000, 0)).toBe(0);
  });

  it('100 % descuenta todo', () => {
    expect(calcularDescuentoPorPorcentaje(100_000, 10_000)).toBe(100_000);
  });

  it('redondea la mitad para arriba', () => {
    // 1 centavo al 50 % = 0,5
    expect(calcularDescuentoPorPorcentaje(1, 5000)).toBe(1);
  });

  it('rechaza porcentajes fuera de rango', () => {
    expect(() => calcularDescuentoPorPorcentaje(100_000, -1)).toThrow(ErrorDinero);
    expect(() => calcularDescuentoPorPorcentaje(100_000, 10_001)).toThrow(ErrorDinero);
  });

  it('rechaza porcentajes decimales', () => {
    expect(() => calcularDescuentoPorPorcentaje(100_000, 12.5)).toThrow(ErrorDinero);
    expect(() => calcularDescuentoPorPorcentaje(100_000.5, 1000)).toThrow(ErrorDinero);
  });
});

describe('calcularTotal', () => {
  it('resta el descuento', () => {
    expect(calcularTotal(100_000, 10_000)).toBe(90_000);
  });

  it('sin descuento devuelve el subtotal', () => {
    expect(calcularTotal(100_000, 0)).toBe(100_000);
  });

  it('rechaza un descuento negativo', () => {
    expect(() => calcularTotal(100_000, -1)).toThrow(ErrorDinero);
  });

  it('rechaza un descuento mayor al subtotal: no existe el total negativo', () => {
    expect(() => calcularTotal(100_000, 100_001)).toThrow(ErrorDinero);
  });

  it('rechaza montos no enteros', () => {
    expect(() => calcularTotal(100_000.5, 0)).toThrow(ErrorDinero);
    expect(() => calcularTotal(100_000, 0.5)).toThrow(ErrorDinero);
  });
});

describe('calcularVuelto', () => {
  it('efectivo con vuelto: el caso de todos los días', () => {
    // $8.372 pagados con $10.000
    expect(calcularVuelto(837_200, [{ metodo: 'efectivo', montoCentavos: 1_000_000 }])).toBe(
      162_800,
    );
  });

  it('pago justo no da vuelto', () => {
    expect(calcularVuelto(837_200, [{ metodo: 'efectivo', montoCentavos: 837_200 }])).toBe(0);
  });

  it('débito por el total exacto', () => {
    expect(calcularVuelto(500_000, [{ metodo: 'debito', montoCentavos: 500_000 }])).toBe(0);
  });

  it('pago mixto: débito y efectivo con vuelto', () => {
    expect(
      calcularVuelto(750_000, [
        { metodo: 'debito', montoCentavos: 400_000 },
        { metodo: 'efectivo', montoCentavos: 400_000 },
      ]),
    ).toBe(50_000);
  });

  it('total en cero con un pago mínimo devuelve todo', () => {
    expect(calcularVuelto(0, [{ metodo: 'efectivo', montoCentavos: 100 }])).toBe(100);
  });

  it('no alcanza para cubrir el total', () => {
    expect(() => calcularVuelto(500_000, [{ metodo: 'efectivo', montoCentavos: 400_000 }])).toThrow(
      /no alcanza/i,
    );
  });

  it('no se da vuelto sobre una tarjeta: eso es un error de carga, no un vuelto', () => {
    expect(() => calcularVuelto(500_000, [{ metodo: 'debito', montoCentavos: 1_000_000 }])).toThrow(
      /efectivo/i,
    );
  });

  it('rechaza un pago en cero o negativo', () => {
    expect(() => calcularVuelto(100, [{ metodo: 'efectivo', montoCentavos: 0 }])).toThrow(
      ErrorDinero,
    );
    expect(() => calcularVuelto(100, [{ metodo: 'efectivo', montoCentavos: -100 }])).toThrow(
      ErrorDinero,
    );
  });

  it('rechaza un total negativo o no entero', () => {
    expect(() => calcularVuelto(-1, [{ metodo: 'efectivo', montoCentavos: 100 }])).toThrow(
      ErrorDinero,
    );
    expect(() => calcularVuelto(1.5, [{ metodo: 'efectivo', montoCentavos: 100 }])).toThrow(
      ErrorDinero,
    );
  });

  it('rechaza un pago con decimales', () => {
    expect(() => calcularVuelto(100, [{ metodo: 'efectivo', montoCentavos: 100.5 }])).toThrow(
      ErrorDinero,
    );
  });
});

describe('efectivoNetoDeVenta', () => {
  it('lo que queda en el cajón es lo entregado menos el vuelto', () => {
    expect(efectivoNetoDeVenta([{ metodo: 'efectivo', montoCentavos: 1_000_000 }], 162_800)).toBe(
      837_200,
    );
  });

  it('una venta con tarjeta no mueve el cajón', () => {
    expect(efectivoNetoDeVenta([{ metodo: 'debito', montoCentavos: 500_000 }], 0)).toBe(0);
  });

  it('en un pago mixto solo cuenta la parte en efectivo', () => {
    expect(
      efectivoNetoDeVenta(
        [
          { metodo: 'debito', montoCentavos: 400_000 },
          { metodo: 'efectivo', montoCentavos: 400_000 },
        ],
        50_000,
      ),
    ).toBe(350_000);
  });

  it('rechaza un vuelto no entero', () => {
    expect(() => efectivoNetoDeVenta([], 0.5)).toThrow(ErrorDinero);
  });
});

describe('calcularArqueo', () => {
  const base = {
    montoInicialCentavos: 5_000_000,
    ventasEfectivoCentavos: 12_500_000,
    ingresosCentavos: 0,
    retirosCentavos: 3_000_000,
    devolucionesEfectivoCentavos: 0,
  };

  it('cierre exacto', () => {
    const arqueo = calcularArqueo(base, 14_500_000);
    expect(arqueo.esperadoCentavos).toBe(14_500_000);
    expect(arqueo.diferenciaCentavos).toBe(0);
    expect(arqueo.falta).toBe(false);
    expect(arqueo.sobra).toBe(false);
  });

  it('falta plata: la diferencia es negativa', () => {
    const arqueo = calcularArqueo(base, 14_300_000);
    expect(arqueo.diferenciaCentavos).toBe(-200_000);
    expect(arqueo.falta).toBe(true);
    expect(arqueo.sobra).toBe(false);
  });

  it('sobra plata', () => {
    const arqueo = calcularArqueo(base, 14_600_000);
    expect(arqueo.diferenciaCentavos).toBe(100_000);
    expect(arqueo.sobra).toBe(true);
    expect(arqueo.falta).toBe(false);
  });

  it('los ingresos suman y las devoluciones restan', () => {
    const arqueo = calcularArqueo(
      { ...base, ingresosCentavos: 1_000_000, devolucionesEfectivoCentavos: 500_000 },
      15_000_000,
    );
    expect(arqueo.esperadoCentavos).toBe(15_000_000);
    expect(arqueo.diferenciaCentavos).toBe(0);
  });

  it('rechaza declarar un monto negativo', () => {
    expect(() => calcularArqueo(base, -1)).toThrow(ErrorDinero);
  });

  it('rechaza declarar un monto con decimales', () => {
    expect(() => calcularArqueo(base, 100.5)).toThrow(ErrorDinero);
  });
});

describe('valorizarStock', () => {
  it('valoriza al costo', () => {
    expect(
      valorizarStock([
        { cantidadMilesimas: 10 * MILESIMAS_POR_UNIDAD, precioCostoCentavos: 100_000 },
        { cantidadMilesimas: 2500, precioCostoCentavos: 400_000 },
      ]),
    ).toBe(1_000_000 + 1_000_000);
  });

  it('un inventario vacío vale cero', () => {
    expect(valorizarStock([])).toBe(0);
  });
});

describe('calcularMargenCentesimas', () => {
  it('35 % de margen', () => {
    expect(calcularMargenCentesimas(100_000, 65_000)).toBe(3500);
  });

  it('vender al costo es margen cero', () => {
    expect(calcularMargenCentesimas(100_000, 100_000)).toBe(0);
  });

  it('vender por debajo del costo da margen negativo', () => {
    expect(calcularMargenCentesimas(100_000, 120_000)).toBe(-2000);
  });

  it('precio cero devuelve cero en vez de dividir por cero', () => {
    expect(calcularMargenCentesimas(0, 50_000)).toBe(0);
  });

  it('rechaza montos no enteros', () => {
    expect(() => calcularMargenCentesimas(100_000.5, 0)).toThrow(ErrorDinero);
  });
});

describe('parsearMontoACentavos', () => {
  it('entero sin separadores', () => {
    expect(parsearMontoACentavos('1234')).toBe(123_400);
  });

  it('con coma decimal, como se escribe acá', () => {
    expect(parsearMontoACentavos('1234,56')).toBe(123_456);
    expect(parsearMontoACentavos('1234,5')).toBe(123_450);
  });

  it('con punto decimal, como sale de un teclado configurado en inglés', () => {
    expect(parsearMontoACentavos('1234.56')).toBe(123_456);
  });

  it('con separador de miles a la argentina', () => {
    expect(parsearMontoACentavos('1.234,56')).toBe(123_456);
    expect(parsearMontoACentavos('1.234.567')).toBe(123_456_700);
  });

  it('con separador de miles a la inglesa', () => {
    expect(parsearMontoACentavos('1,234.56')).toBe(123_456);
  });

  it('ignora los espacios', () => {
    expect(parsearMontoACentavos('  1234,56  ')).toBe(123_456);
    expect(parsearMontoACentavos('1 234')).toBe(123_400);
  });

  it('corta en dos decimales', () => {
    expect(parsearMontoACentavos('10,999')).toBe(null);
  });

  it('devuelve null con texto vacío o no numérico', () => {
    expect(parsearMontoACentavos('')).toBe(null);
    expect(parsearMontoACentavos('   ')).toBe(null);
    expect(parsearMontoACentavos('abc')).toBe(null);
    expect(parsearMontoACentavos('12abc')).toBe(null);
    expect(parsearMontoACentavos('-100')).toBe(null);
  });

  it('devuelve null con separadores de miles mal puestos', () => {
    expect(parsearMontoACentavos('1.23.456')).toBe(null);
  });

  it('devuelve null con un número imposible de grande', () => {
    // Trece dígitos: la expresión regular corta en doce, que es lo que
    // garantiza que el resultado siga siendo un entero seguro.
    expect(parsearMontoACentavos('9999999999999')).toBe(null);
    expect(parsearMontoACentavos('999999999999,99')).toBe(99_999_999_999_999);
  });

  it('acepta la coma sin decimales', () => {
    expect(parsearMontoACentavos('12,')).toBe(1200);
  });
});

describe('parsearCantidadAMilesimas', () => {
  it('kilos con tres decimales', () => {
    expect(parsearCantidadAMilesimas('1,250')).toBe(1250);
    expect(parsearCantidadAMilesimas('0,125')).toBe(125);
  });

  it('unidades enteras', () => {
    expect(parsearCantidadAMilesimas('3')).toBe(3000);
  });

  it('rellena los decimales que falten', () => {
    expect(parsearCantidadAMilesimas('1,5')).toBe(1500);
  });

  it('con separador de miles', () => {
    expect(parsearCantidadAMilesimas('1.234')).toBe(1234);
  });

  it('devuelve null con lo que no es una cantidad', () => {
    expect(parsearCantidadAMilesimas('')).toBe(null);
    expect(parsearCantidadAMilesimas('kg')).toBe(null);
    expect(parsearCantidadAMilesimas('1,2345')).toBe(null);
    expect(parsearCantidadAMilesimas('1.23.456')).toBe(null);
    expect(parsearCantidadAMilesimas('99999999')).toBe(null);
  });
});

describe('BILLETES_SUGERIDOS_CENTAVOS', () => {
  it('son los billetes que hay en el cajón', () => {
    expect(BILLETES_SUGERIDOS_CENTAVOS).toEqual([100_000, 200_000, 500_000, 1_000_000]);
  });
});
