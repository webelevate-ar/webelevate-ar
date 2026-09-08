import {
  calcularDescuentoPorPorcentaje,
  calcularSubtotal,
  calcularTotal,
  calcularVuelto,
  efectivoNetoDeVenta,
  multiplicarPorCantidad,
} from '../dinero';
import { CODIGOS, ErrorApp } from '../error-app';
import * as auditoria from '../repositorios/auditoria';
import * as repoCaja from '../repositorios/caja';
import * as repoProductos from '../repositorios/productos';
import * as repoVentas from '../repositorios/ventas';
import type { SesionUsuario } from '../sesion';
import { type MetodoPago } from '../validacion/enums';
import type { DatosCrearVenta } from '../validacion/esquemas';
import { autorizarConPinDeSupervisor } from './autenticacion';

/**
 * Regla de negocio de la venta.
 *
 * Lo importante de este archivo: **el total se recalcula acá, desde los
 * productos de la base**. Lo que el navegador mandó como precio se ignora. Si
 * se confiara en el número del cliente, cualquiera con la consola abierta
 * podría cobrarse un televisor a cien pesos (§17).
 */

export interface ResultadoVenta {
  venta: repoVentas.VentaCompleta;
  yaExistia: boolean;
}

export async function crearVenta(
  datos: DatosCrearVenta,
  sesion: SesionUsuario,
  ip: string | null,
): Promise<ResultadoVenta> {
  // 1. Idempotencia primero: si esta clave ya se cobró, se devuelve aquella
  //    venta y no se cobra de nuevo (§8.4). Es lo que hace seguro el reintento
  //    del modo offline.
  const yaCobrada = await repoVentas.buscarPorClaveIdempotencia(datos.claveIdempotencia);
  if (yaCobrada) return { venta: yaCobrada, yaExistia: true };

  // 2. Tiene que haber una caja abierta: una venta sin caja no entra en ningún
  //    arqueo y aparece de la nada en el cierre.
  const cajaSesion = await repoCaja.sesionAbiertaDeUsuario(sesion.usuarioId);
  if (!cajaSesion) {
    throw ErrorApp.conflicto(
      CODIGOS.CAJA_CERRADA,
      'No tenés una caja abierta. Abrí la caja antes de cobrar.',
    );
  }

  // 3. Los precios salen de la base, no del cliente.
  const productos = await repoProductos.buscarVariosPorId(
    datos.items.map((item) => item.productoId),
  );
  const porId = new Map(productos.map((producto) => [producto.id, producto]));

  const items = datos.items.map((item) => {
    const producto = porId.get(item.productoId);
    if (!producto || !producto.activo) {
      throw ErrorApp.noEncontrado('Uno de los productos del carrito ya no está disponible.');
    }
    return {
      productoId: producto.id,
      nombreSnapshot: producto.nombre,
      skuSnapshot: producto.sku,
      unidadSnapshot: producto.unidad,
      precioUnitarioCentavos: producto.precioVentaCentavos,
      cantidadMilesimas: item.cantidadMilesimas,
      subtotalCentavos: multiplicarPorCantidad(
        producto.precioVentaCentavos,
        item.cantidadMilesimas,
      ),
    };
  });

  const subtotal = calcularSubtotal(items);
  const descuento = calcularDescuentoPorPorcentaje(subtotal, datos.descuentoPorcentajeCentesimas);
  const total = calcularTotal(subtotal, descuento);

  /*
   * Una venta que estuvo en la cola offline se cobró con el precio que tenía el
   * espejo del catálogo. El total lo acaba de recalcular el paso 3 con el
   * precio de hoy, que es la regla que no se toca. Si los dos números no
   * coinciden, la venta **no entra**.
   *
   * Podría entrar: alcanzaría con anotar la diferencia como descuento y quedaría
   * todo cuadrado. No se hace, y la razón es concreta: cualquier cajero podría
   * armar un pedido diciendo que es "offline" con un total menor, y darse solo
   * el descuento que el sistema le pide autorizar con PIN de supervisor (§8.6).
   *
   * El precio de rechazarla es que alguien tenga que resolverla a mano. No es
   * gratis, pero es visible: la venta queda en la cola, en rojo, con los dos
   * importes escritos. Lo otro sería un agujero silencioso.
   *
   * Se compara contra el total y no solo contra "alcanza o no alcanza" porque
   * un precio que **bajó** también rompe: el servidor calcularía un vuelto que
   * el cliente nunca recibió, y ese vuelto de mentira descuadra el arqueo.
   */
  if (
    datos.cobradaSinConexionEn &&
    datos.totalCobradoCentavos !== null &&
    datos.totalCobradoCentavos !== total
  ) {
    throw ErrorApp.conflicto(
      CODIGOS.PRECIO_DESFASADO,
      `Se cobró ${(datos.totalCobradoCentavos / 100).toFixed(2)} sin conexión y hoy esos ` +
        `productos suman ${(total / 100).toFixed(2)}: algún precio cambió en el medio. ` +
        'Resolvela a mano desde la pantalla de ventas sin sincronizar.',
    );
  }

  // 4. El descuento manual lo autoriza un supervisor, verificado en el
  //    servidor. Que el cajero no vea el botón no alcanza (§8.6).
  let autorizadoPor: { usuarioId: string; nombre: string } | null = null;
  if (descuento > 0) {
    if (sesion.rol === 'CAJERO') {
      if (!datos.pinSupervisor) {
        throw ErrorApp.sinPermiso('El descuento lo tiene que autorizar un supervisor.');
      }
      autorizadoPor = await autorizarConPinDeSupervisor(datos.pinSupervisor);
    } else {
      autorizadoPor = { usuarioId: sesion.usuarioId, nombre: sesion.nombre };
    }
  }

  // 5. El vuelto también se recalcula acá. `calcularVuelto` rechaza que se dé
  //    vuelto sobre un pago con tarjeta.
  const pagos = datos.pagos.map((pago) => ({
    metodo: pago.metodo as MetodoPago,
    montoCentavos: pago.montoCentavos,
  }));

  let vuelto: number;
  try {
    vuelto = calcularVuelto(total, pagos);
  } catch (error) {
    throw ErrorApp.datosInvalidos(
      error instanceof Error ? error.message : 'Los pagos no cubren el total.',
    );
  }

  const efectivoNeto = efectivoNetoDeVenta(pagos, vuelto);

  // El vuelto se guarda en el pago en efectivo, que es de donde sale.
  let vueltoAsignado = false;
  const pagosAPersistir = pagos.map((pago) => {
    const asignar = pago.metodo === 'efectivo' && !vueltoAsignado;
    if (asignar) vueltoAsignado = true;
    return {
      metodo: pago.metodo,
      montoCentavos: pago.montoCentavos,
      vueltoCentavos: asignar ? vuelto : 0,
    };
  });

  const venta = await repoVentas.crearVentaCompleta({
    claveIdempotencia: datos.claveIdempotencia,
    cajaSesionId: cajaSesion.id,
    usuarioId: sesion.usuarioId,
    clienteId: datos.clienteId,
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    totalCentavos: total,
    items,
    pagos: pagosAPersistir,
    efectivoNetoCentavos: efectivoNeto,
  });

  /*
   * 6. Queda escrito que esta venta se cobró sin conexión, con la hora real del
   *    cobro. Sin esto no habría forma de saber cuáles fueron offline, y esa es
   *    la primera pregunta cuando un arqueo no cierra o cuando el orden de los
   *    números de venta no coincide con el rollo de la caja.
   */
  if (datos.cobradaSinConexionEn) {
    await auditoria.registrar({
      usuarioId: sesion.usuarioId,
      accion: 'venta_offline',
      entidad: 'Venta',
      entidadId: venta.id,
      datosAntes: { cobradaEn: datos.cobradaSinConexionEn },
      datosDespues: {
        numero: venta.numero,
        totalCentavos: total,
        // Cuánto tardó en llegar al servidor. Un número grande acá es un corte
        // largo, y explica por qué una venta de la mañana tiene número de tarde.
        demoraMinutos: Math.round(
          (Date.now() - new Date(datos.cobradaSinConexionEn).getTime()) / 60_000,
        ),
      },
      ip,
    });
  }

  if (autorizadoPor) {
    await auditoria.registrar({
      usuarioId: autorizadoPor.usuarioId,
      accion: 'descuento_manual',
      entidad: 'Venta',
      entidadId: venta.id,
      datosAntes: { subtotalCentavos: subtotal },
      datosDespues: {
        descuentoCentavos: descuento,
        totalCentavos: total,
        cobradoPor: sesion.nombre,
      },
      ip,
    });
  }

  return { venta, yaExistia: false };
}

export async function anular(
  ventaId: string,
  motivo: string,
  sesion: SesionUsuario,
  ip: string | null,
): Promise<repoVentas.VentaCompleta> {
  const venta = await repoVentas.buscarPorId(ventaId);
  if (!venta) throw ErrorApp.noEncontrado('Esa venta no existe.');
  if (venta.estado === 'anulada') {
    throw ErrorApp.conflicto(CODIGOS.VENTA_YA_ANULADA, 'Esa venta ya estaba anulada.');
  }

  const anulada = await repoVentas.anularVenta({ ventaId, usuarioId: sesion.usuarioId, motivo });

  await auditoria.registrar({
    usuarioId: sesion.usuarioId,
    accion: 'anulacion_venta',
    entidad: 'Venta',
    entidadId: venta.id,
    datosAntes: { estado: 'completada', totalCentavos: venta.totalCentavos },
    datosDespues: { estado: 'anulada', motivo },
    ip,
  });

  return anulada;
}

export function buscarPorId(id: string) {
  return repoVentas.buscarPorId(id);
}

export function buscarPorNumero(numero: number) {
  return repoVentas.buscarPorNumero(numero);
}

export const POR_PAGINA = 25;

export function listar(filtro: {
  desde: string | null;
  hasta: string | null;
  estado: 'completada' | 'anulada' | 'todas';
  usuarioId: string | null;
  cajaSesionId: string | null;
  texto: string;
  pagina: number;
}) {
  // El texto del buscador del historial es el número de venta. Buscar por
  // nombre de producto acá obligaría a recorrer los ítems de miles de ventas.
  const numero = /^\d+$/.test(filtro.texto) ? Number(filtro.texto) : null;

  return repoVentas.listarPaginado({
    desde: filtro.desde ? new Date(filtro.desde) : null,
    hasta: filtro.hasta ? finDelDia(filtro.hasta) : null,
    estado: filtro.estado,
    usuarioId: filtro.usuarioId,
    cajaSesionId: filtro.cajaSesionId,
    numero,
    pagina: filtro.pagina,
    porPagina: POR_PAGINA,
  });
}

function finDelDia(fecha: string): Date {
  const limite = new Date(fecha);
  limite.setHours(23, 59, 59, 999);
  return limite;
}
