import type { VentaPendiente } from './cola';

/**
 * El almacén del navegador: IndexedDB.
 *
 * Guarda dos cosas. El **espejo del catálogo**, para poder buscar productos sin
 * red, y la **cola de ventas** cobradas sin conexión. `localStorage` no sirve
 * para esto: es síncrono —bloquea la pantalla de venta— y tiene un límite de
 * unos 5 MB que 400 productos rozan.
 *
 * ⚠️ **El plan pedía Dexie y no se usó.** El build de Dexie 4 pesa 87 kB
 * minificado y 29 kB comprimido —medido sobre `dist/modern/dexie.min.mjs`, no
 * estimado— y la ruta de venta está en 178 kB de un presupuesto de 200 (§7.7).
 * Lo que hace falta acá son cuatro operaciones sobre dos almacenes, sin índices
 * ni consultas, y eso es la API cruda de IndexedDB sin adornos. La decisión se
 * paga con este archivo: si algún día hacen falta índices, consultas por rango
 * o migraciones de versión, Dexie deja de ser un lujo.
 *
 * ⚠️ **IndexedDB puede no estar.** En modo privado de algunos navegadores, con
 * la cuota llena o con las cookies de sitio bloqueadas, `open` falla. Cuando
 * eso pasa, cada función devuelve `null` y **nunca una lista vacía**: una lista
 * vacía diría "no hay ventas pendientes", que es exactamente lo contrario de
 * "no pude leer las ventas pendientes". Un silencio no es un dato.
 */

const NOMBRE_BASE = 'sistema-ventas';
const VERSION = 1;

const ESPEJO = 'espejo';
const PENDIENTES = 'pendientes';

export const CLAVE_CATALOGO = 'catalogo';

let promesaBase: Promise<IDBDatabase | null> | null = null;
let yaAvisado = false;

function avisarUnaVez(motivo: string): void {
  if (yaAvisado) return;
  yaAvisado = true;
  console.warn(`No hay almacén local: ${motivo}. El modo offline queda apagado.`);
}

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    avisarUnaVez('este navegador no expone IndexedDB');
    return Promise.resolve(null);
  }

  promesaBase ??= new Promise<IDBDatabase | null>((resolver) => {
    let pedido: IDBOpenDBRequest;
    try {
      pedido = indexedDB.open(NOMBRE_BASE, VERSION);
    } catch (error) {
      avisarUnaVez(error instanceof Error ? error.message : 'no se pudo abrir');
      resolver(null);
      return;
    }

    pedido.onupgradeneeded = () => {
      const base = pedido.result;
      if (!base.objectStoreNames.contains(ESPEJO)) base.createObjectStore(ESPEJO);
      if (!base.objectStoreNames.contains(PENDIENTES)) {
        base.createObjectStore(PENDIENTES, { keyPath: 'claveIdempotencia' });
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => {
      avisarUnaVez(pedido.error?.message ?? 'la apertura falló');
      resolver(null);
    };
    // Otra pestaña tiene abierta una versión anterior y no la suelta.
    pedido.onblocked = () => {
      avisarUnaVez('otra pestaña tiene la base bloqueada');
      resolver(null);
    };
  });

  return promesaBase;
}

/** Lectura. `null` significa "no se pudo leer", nunca "no hay nada". */
async function leer<T>(
  almacen: string,
  accion: (deposito: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const base = await abrir();
  if (!base) return null;

  return new Promise<T | null>((resolver) => {
    let pedido: IDBRequest;
    try {
      pedido = accion(base.transaction(almacen, 'readonly').objectStore(almacen));
    } catch {
      resolver(null);
      return;
    }
    pedido.onsuccess = () => resolver(pedido.result as T);
    pedido.onerror = () => resolver(null);
  });
}

/**
 * Escritura. Devuelve `true` solo cuando la transacción **confirmó**.
 *
 * La diferencia con esperar el `onsuccess` del pedido no es teórica: el pedido
 * sale bien y la transacción puede abortar después por cuota. Si esta función
 * devolviera `true` ahí, la pantalla le diría al cajero que la venta quedó
 * guardada cuando no quedó nada.
 */
async function escribir(
  almacen: string,
  accion: (deposito: IDBObjectStore) => void,
): Promise<boolean> {
  const base = await abrir();
  if (!base) return false;

  return new Promise<boolean>((resolver) => {
    try {
      const transaccion = base.transaction(almacen, 'readwrite');
      transaccion.oncomplete = () => resolver(true);
      transaccion.onerror = () => resolver(false);
      transaccion.onabort = () => resolver(false);
      accion(transaccion.objectStore(almacen));
    } catch {
      resolver(false);
    }
  });
}

// ─── Espejo del catálogo ─────────────────────────────────────────────────────

export function guardarEspejo(clave: string, datos: unknown): Promise<boolean> {
  return escribir(ESPEJO, (deposito) => {
    deposito.put(datos, clave);
  });
}

export function leerEspejo<T>(clave: string): Promise<T | null> {
  return leer<T>(ESPEJO, (deposito) => deposito.get(clave));
}

export function borrarEspejo(): Promise<boolean> {
  return escribir(ESPEJO, (deposito) => {
    deposito.clear();
  });
}

// ─── Cola de ventas ──────────────────────────────────────────────────────────

/**
 * Guarda o reemplaza una venta de la cola. `put` y no `add` a propósito: la
 * clave de idempotencia es la clave primaria, así que reencolar la misma venta
 * la pisa en vez de duplicarla.
 */
export function guardarPendiente(venta: VentaPendiente): Promise<boolean> {
  return escribir(PENDIENTES, (deposito) => {
    deposito.put(venta);
  });
}

export function listarPendientes(): Promise<VentaPendiente[] | null> {
  return leer<VentaPendiente[]>(PENDIENTES, (deposito) => deposito.getAll());
}

export function borrarPendiente(claveIdempotencia: string): Promise<boolean> {
  return escribir(PENDIENTES, (deposito) => {
    deposito.delete(claveIdempotencia);
  });
}

/** ¿Se puede usar el modo offline en este navegador? */
export async function hayAlmacenLocal(): Promise<boolean> {
  return (await abrir()) !== null;
}

/** Solo para los tests: obliga a reabrir la base en la corrida siguiente. */
export function olvidarBase(): void {
  promesaBase = null;
  yaAvisado = false;
}
