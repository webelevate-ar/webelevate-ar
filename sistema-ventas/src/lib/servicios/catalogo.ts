import { ErrorApp } from '../error-app';
import * as auditoria from '../repositorios/auditoria';
import * as repoProductos from '../repositorios/productos';
import * as repoStock from '../repositorios/stock';
import type { SesionUsuario } from '../sesion';
import type { DatosProducto } from '../validacion/esquemas';

/** Catálogo y stock. */

export const POR_PAGINA = 30;

export function catalogoCompleto() {
  return repoProductos.listarCatalogo();
}

export function categorias() {
  return repoProductos.listarCategorias();
}

export function proveedores() {
  return repoProductos.listarProveedores();
}

export function listar(filtro: {
  texto: string;
  categoriaId: string | null;
  soloBajoMinimo: boolean;
  pagina: number;
}) {
  return repoProductos.listarPaginado({ ...filtro, porPagina: POR_PAGINA });
}

export async function bajoMinimo() {
  const filas = await repoProductos.listarBajoMinimo();
  return filas.map((fila) => ({
    id: fila.id,
    sku: fila.sku,
    nombre: fila.nombre,
    unidad: fila.unidad,
    stockMilesimas: fila.stock_milesimas,
    stockMinimoMilesimas: fila.stock_minimo_milesimas,
  }));
}

export async function crear(datos: DatosProducto, sesion: SesionUsuario, ip: string | null) {
  await exigirCodigosLibres(datos, null);

  const producto = await repoProductos.crear({
    sku: datos.sku,
    codigoBarras: datos.codigoBarras,
    nombre: datos.nombre,
    categoriaId: datos.categoriaId,
    proveedorId: datos.proveedorId,
    precioVentaCentavos: datos.precioVentaCentavos,
    precioCostoCentavos: datos.precioCostoCentavos,
    stockMinimoMilesimas: datos.stockMinimoMilesimas,
    unidad: datos.unidad,
    activo: datos.activo,
  });

  await auditoria.registrar({
    usuarioId: sesion.usuarioId,
    accion: 'alta_producto',
    entidad: 'Producto',
    entidadId: producto.id,
    datosDespues: { sku: producto.sku, nombre: producto.nombre },
    ip,
  });

  return producto;
}

export async function actualizar(
  id: string,
  datos: DatosProducto,
  sesion: SesionUsuario,
  ip: string | null,
) {
  const anterior = await repoProductos.buscarPorId(id);
  if (!anterior) throw ErrorApp.noEncontrado('Ese producto no existe.');
  await exigirCodigosLibres(datos, id);

  const producto = await repoProductos.actualizar(id, {
    sku: datos.sku,
    codigoBarras: datos.codigoBarras,
    nombre: datos.nombre,
    categoriaId: datos.categoriaId,
    proveedorId: datos.proveedorId,
    precioVentaCentavos: datos.precioVentaCentavos,
    precioCostoCentavos: datos.precioCostoCentavos,
    stockMinimoMilesimas: datos.stockMinimoMilesimas,
    unidad: datos.unidad,
    activo: datos.activo,
  });

  // Un cambio de precio es de las cosas que el dueño quiere poder rastrear:
  // se audita aparte del resto de la edición.
  if (anterior.precioVentaCentavos !== producto.precioVentaCentavos) {
    await auditoria.registrar({
      usuarioId: sesion.usuarioId,
      accion: 'cambio_precio',
      entidad: 'Producto',
      entidadId: producto.id,
      datosAntes: { precioVentaCentavos: anterior.precioVentaCentavos },
      datosDespues: { precioVentaCentavos: producto.precioVentaCentavos },
      ip,
    });
  }

  if (anterior.activo && !producto.activo) {
    await auditoria.registrar({
      usuarioId: sesion.usuarioId,
      accion: 'baja_producto',
      entidad: 'Producto',
      entidadId: producto.id,
      datosAntes: { activo: true },
      datosDespues: { activo: false },
      ip,
    });
  }

  return producto;
}

export function movimientosDeStock(productoId?: string) {
  return repoStock.listarMovimientos(productoId ? { productoId } : {});
}

export async function registrarMovimientoStock(
  datos: { productoId: string; tipo: string; cantidadMilesimas: number; motivo: string },
  sesion: SesionUsuario,
  ip: string | null,
) {
  const producto = await repoProductos.buscarPorId(datos.productoId);
  if (!producto) throw ErrorApp.noEncontrado('Ese producto no existe.');

  const resultado = await repoStock.registrarMovimiento({ ...datos, usuarioId: sesion.usuarioId });

  await auditoria.registrar({
    usuarioId: sesion.usuarioId,
    accion: `stock_${datos.tipo}`,
    entidad: 'Producto',
    entidadId: producto.id,
    datosAntes: { stockMilesimas: producto.stockMilesimas },
    datosDespues: {
      stockMilesimas: resultado.producto.stockMilesimas,
      cantidadMilesimas: datos.cantidadMilesimas,
      motivo: datos.motivo,
    },
    ip,
  });

  return resultado;
}

/**
 * El SKU y el código de barras son únicos en la base. Se comprueba antes para
 * poder decir cuál de los dos está repetido: el error de Prisma diría
 * "unique constraint failed", que no le sirve a nadie del otro lado (§8.5).
 */
async function exigirCodigosLibres(datos: DatosProducto, idPropio: string | null): Promise<void> {
  const porSku = await repoProductos.buscarPorSku(datos.sku);
  if (porSku && porSku.id !== idPropio) {
    throw ErrorApp.datosInvalidos(`El código interno ${datos.sku} ya lo usa "${porSku.nombre}".`, [
      { campo: 'sku', mensaje: 'Ese código interno ya está en uso' },
    ]);
  }

  if (datos.codigoBarras) {
    const porCodigo = await repoProductos.buscarPorCodigoBarras(datos.codigoBarras);
    if (porCodigo && porCodigo.id !== idPropio) {
      throw ErrorApp.datosInvalidos(
        `El código de barras ya lo usa "${porCodigo.nombre}".`,
        [{ campo: 'codigoBarras', mensaje: 'Ese código de barras ya está en uso' }],
      );
    }
  }
}
