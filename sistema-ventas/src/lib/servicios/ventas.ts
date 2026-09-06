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
