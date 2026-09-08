import { describe, expect, it } from 'vitest';
import {
  MAXIMO_INTENTOS,
  resumirCola,
  trasElFallo,
  ventasASincronizar,
  veredictoDelFallo,
  type VentaPendiente,
} from '@/lib/offline/cola';

/**
 * La cola offline decide qué pasa con ventas que ya se cobraron. Si una regla
 * de acá está mal, la plata está en el cajón y la venta no está en ningún lado.
 */

function venta(cambios: Partial<VentaPendiente> = {}): VentaPendiente {
  return {
    claveIdempotencia: 'c1',
    usuarioId: 'u1',
    usuarioNombre: 'Cajero',
    cobradaEn: 1_000,
    items: [
      {
        productoId: 'p1',
        nombre: 'Yerba',
        unidad: 'unidad',
        precioUnitarioCentavos: 120_000,
        cantidadMilesimas: 1000,
      },
    ],
    pagos: [{ metodo: 'efectivo', montoCentavos: 120_000 }],
    clienteId: null,
    totalCobradoCentavos: 120_000,
    vueltoCentavos: 0,
    intentos: 0,
    estado: 'en_cola',
    ultimoError: null,
    ...cambios,
  };
}

describe('veredictoDelFallo', () => {
  it('reintenta lo que se arregla solo', () => {
    expect(veredictoDelFallo(0, 'SIN_CONEXION')).toBe('reintentar');
    expect(veredictoDelFallo(500, 'ERROR_INTERNO')).toBe('reintentar');
    expect(veredictoDelFallo(502, 'ERROR_INTERNO')).toBe('reintentar');
    expect(veredictoDelFallo(429, 'DEMASIADAS')).toBe('reintentar');
    expect(veredictoDelFallo(408, 'TIEMPO')).toBe('reintentar');
  });

  it('reintenta la sesión vencida: se arregla cuando el cajero vuelve a entrar', () => {
    expect(veredictoDelFallo(401, 'SIN_SESION')).toBe('reintentar');
  });

  it('reintenta la caja cerrada: se arregla abriendo la caja', () => {
    expect(veredictoDelFallo(409, 'CAJA_CERRADA')).toBe('reintentar');
  });

  it('rechaza lo que no cambia por esperar', () => {
    // Producto dado de baja: reintentar mil veces da mil veces lo mismo, y
    // mientras tanto la venta queda escondida en una cola que nadie mira.
    expect(veredictoDelFallo(404, 'NO_ENCONTRADO')).toBe('rechazar');
    expect(veredictoDelFallo(400, 'DATOS_INVALIDOS')).toBe('rechazar');
    expect(veredictoDelFallo(403, 'SIN_PERMISO')).toBe('rechazar');
  });

  it('un 409 que no es la caja cerrada se rechaza', () => {
    expect(veredictoDelFallo(409, 'VENTA_YA_ANULADA')).toBe('rechazar');
  });
});

describe('trasElFallo', () => {
  it('un fallo de red no gasta intentos', () => {
    let actual = venta();
    for (let vez = 0; vez < 50; vez += 1) {
      actual = trasElFallo(actual, {
        status: 0,
        codigo: 'SIN_CONEXION',
        mensaje: 'No hay conexión',
      });
    }
    // Ocho horas sin internet son el caso normal, no una anomalía: si contaran
    // como intentos, todas las ventas del turno quedarían rechazadas solas.
    expect(actual.intentos).toBe(0);
    expect(actual.estado).toBe('en_cola');
    expect(actual.ultimoError).toBe('No hay conexión');
  });

  it('un 4xx la rechaza en el primer intento, sin gastar reintentos', () => {
    const actual = trasElFallo(venta(), {
      status: 404,
      codigo: 'NO_ENCONTRADO',
      mensaje: 'Uno de los productos ya no está disponible.',
    });
    expect(actual.estado).toBe('rechazada');
    expect(actual.ultimoError).toContain('ya no está disponible');
  });

  it('un 500 que se repite termina rechazada, no reintentando para siempre', () => {
    let actual = venta();
    for (let vez = 0; vez < MAXIMO_INTENTOS; vez += 1) {
      actual = trasElFallo(actual, { status: 500, codigo: 'ERROR', mensaje: 'Falló' });
    }
    expect(actual.intentos).toBe(MAXIMO_INTENTOS);
    expect(actual.estado).toBe('rechazada');
    expect(actual.ultimoError).toContain(`${MAXIMO_INTENTOS} veces`);
  });

  it('antes del tope sigue en cola', () => {
    let actual = venta();
    for (let vez = 0; vez < MAXIMO_INTENTOS - 1; vez += 1) {
      actual = trasElFallo(actual, { status: 500, codigo: 'ERROR', mensaje: 'Falló' });
    }
    expect(actual.estado).toBe('en_cola');
  });

  it('nunca devuelve una venta sin la información del cobro', () => {
    const original = venta();
    const actual = trasElFallo(original, { status: 400, codigo: 'X', mensaje: 'no' });
    expect(actual.items).toEqual(original.items);
    expect(actual.pagos).toEqual(original.pagos);
    expect(actual.totalCobradoCentavos).toBe(original.totalCobradoCentavos);
    expect(actual.claveIdempotencia).toBe(original.claveIdempotencia);
  });
});

describe('ventasASincronizar', () => {
  it('manda de la más vieja a la más nueva', () => {
    const lista = [
      venta({ claveIdempotencia: 'c3', cobradaEn: 300 }),
      venta({ claveIdempotencia: 'c1', cobradaEn: 100 }),
      venta({ claveIdempotencia: 'c2', cobradaEn: 200 }),
    ];
    expect(ventasASincronizar(lista, 'u1').map((fila) => fila.claveIdempotencia)).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('no manda las de otro usuario', () => {
    const lista = [venta({ claveIdempotencia: 'mia' }), venta({ claveIdempotencia: 'ajena', usuarioId: 'u2' })];
    // Una venta tiene que entrar en la caja de quien la cobró. Mandarla con la
    // sesión de otro la metería en el turno equivocado.
    expect(ventasASincronizar(lista, 'u1').map((fila) => fila.claveIdempotencia)).toEqual(['mia']);
  });

  it('no reintenta sola una rechazada', () => {
    const lista = [venta({ estado: 'rechazada' })];
    expect(ventasASincronizar(lista, 'u1')).toHaveLength(0);
  });

  it('no muta la lista que recibe', () => {
    const lista = [venta({ cobradaEn: 300 }), venta({ cobradaEn: 100 })];
    const copia = [...lista];
    ventasASincronizar(lista, 'u1');
    expect(lista).toEqual(copia);
  });
});

describe('resumirCola', () => {
  it('separa lo propio, lo rechazado y lo de otro turno', () => {
    const resumen = resumirCola(
      [
        venta({ claveIdempotencia: 'a', totalCobradoCentavos: 100 }),
        venta({ claveIdempotencia: 'b', totalCobradoCentavos: 200 }),
        venta({ claveIdempotencia: 'c', totalCobradoCentavos: 300, estado: 'rechazada' }),
        venta({ claveIdempotencia: 'd', totalCobradoCentavos: 400, usuarioId: 'u2' }),
      ],
      'u1',
    );
    expect(resumen).toEqual({
      enCola: 2,
      rechazadas: 1,
      deOtroUsuario: 1,
      totalCentavos: 1000,
    });
  });

  it('sin sesión no le adjudica a nadie: todo lo no rechazado va a la cola', () => {
    const resumen = resumirCola([venta(), venta({ usuarioId: 'u2' })], null);
    expect(resumen.enCola).toBe(2);
    expect(resumen.deOtroUsuario).toBe(0);
  });
});
