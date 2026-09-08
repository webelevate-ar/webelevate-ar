// Tiene que ir primero: define `indexedDB` global antes de que el almacén lo
// busque. Si se importara después, `abrir()` vería que no existe y apagaría el
// modo offline sin decir nada — que es justo el caso que el almacén contempla.
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import {
  borrarEspejo,
  borrarPendiente,
  CLAVE_CATALOGO,
  guardarEspejo,
  guardarPendiente,
  hayAlmacenLocal,
  leerEspejo,
  listarPendientes,
  olvidarBase,
} from '@/lib/offline/almacen';
import type { VentaPendiente } from '@/lib/offline/cola';

function venta(clave: string, cambios: Partial<VentaPendiente> = {}): VentaPendiente {
  return {
    claveIdempotencia: clave,
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

async function vaciar() {
  const pendientes = await listarPendientes();
  for (const fila of pendientes ?? []) await borrarPendiente(fila.claveIdempotencia);
  await borrarEspejo();
}

beforeEach(async () => {
  olvidarBase();
  await vaciar();
});

describe('almacén local', () => {
  it('está disponible cuando hay IndexedDB', async () => {
    expect(await hayAlmacenLocal()).toBe(true);
  });

  it('guarda y devuelve el espejo del catálogo tal cual', async () => {
    const espejo = {
      productos: [{ id: 'p1', nombre: 'Yerba' }],
      categorias: [{ id: 'c1', nombre: 'Almacén' }],
      guardadoEn: 1_700_000_000_000,
    };
    expect(await guardarEspejo(CLAVE_CATALOGO, espejo)).toBe(true);
    expect(await leerEspejo(CLAVE_CATALOGO)).toEqual(espejo);
  });

  it('sin espejo guardado devuelve undefined, no un objeto vacío', async () => {
    // IndexedDB devuelve `undefined` para una clave que no está. Vale la
    // distinción: un objeto vacío se vería como un catálogo sin productos.
    expect(await leerEspejo('no-existe')).toBeUndefined();
  });

  it('encola una venta y la devuelve entera', async () => {
    expect(await guardarPendiente(venta('c1'))).toBe(true);
    const pendientes = await listarPendientes();
    expect(pendientes).toHaveLength(1);
    expect(pendientes?.[0]).toEqual(venta('c1'));
  });

  it('guardar dos veces la misma clave no duplica el cobro', async () => {
    // Es la propiedad que hace segura toda la cola: la clave de idempotencia es
    // la clave primaria, así que reencolar pisa en vez de agregar. Si esto
    // fallara, un reintento cobraría dos veces.
    await guardarPendiente(venta('c1'));
    await guardarPendiente(venta('c1', { intentos: 3, ultimoError: 'falló' }));

    const pendientes = await listarPendientes();
    expect(pendientes).toHaveLength(1);
    expect(pendientes?.[0]?.intentos).toBe(3);
  });

  it('borra solo la que se le pide', async () => {
    await guardarPendiente(venta('c1'));
    await guardarPendiente(venta('c2'));
    expect(await borrarPendiente('c1')).toBe(true);

    const pendientes = await listarPendientes();
    expect(pendientes?.map((fila) => fila.claveIdempotencia)).toEqual(['c2']);
  });

  it('la cola vacía es una lista vacía, no null', async () => {
    // La diferencia sostiene toda la pantalla de pendientes: `[]` es "no hay
    // ventas guardadas" y `null` es "no pude leer". Confundirlas dejaría cerrar
    // una caja con ventas afuera.
    expect(await listarPendientes()).toEqual([]);
  });
});

describe('sin IndexedDB', () => {
  it('no rompe: apaga el modo offline y lo dice devolviendo null', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error se saca a propósito para simular incógnito o cuota llena
    delete globalThis.indexedDB;
    olvidarBase();

    try {
      expect(await hayAlmacenLocal()).toBe(false);
      // `null` y no `[]`: la pantalla tiene que poder decir "no sé qué hay en
      // la cola", que no es lo mismo que "la cola está vacía".
      expect(await listarPendientes()).toBeNull();
      expect(await leerEspejo(CLAVE_CATALOGO)).toBeNull();
      // Y una escritura que no se hizo devuelve `false`, para que el cobro
      // pueda avisar en vez de mostrar el vuelto de una venta que se perdió.
      expect(await guardarPendiente(venta('c1'))).toBe(false);
    } finally {
      globalThis.indexedDB = original;
      olvidarBase();
    }
  });
});
