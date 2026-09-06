import type { Prisma } from '@prisma/client';
import { normalizarParaBuscar } from '../formato';
import type { ClientePrisma } from '../prisma';
import { prisma } from '../prisma';

/**
 * Repositorio de productos.
 *
 * El catálogo entero se manda al navegador una sola vez al iniciar sesión y
 * ahí se busca (§7.7). Por eso `listarCatalogo` devuelve un objeto chico y
 * plano: 400 productos con seis campos pesan poco; con las relaciones
 * completas, no.
 */

export interface ProductoDeCatalogo {
  id: string;
  sku: string;
  codigoBarras: string | null;
  nombre: string;
  nombreBusqueda: string;
  categoriaId: string;
  categoria: string;
  color: string;
  precioVentaCentavos: number;
  stockMilesimas: number;
  stockMinimoMilesimas: number;
  unidad: string;
}

export async function listarCatalogo(): Promise<ProductoDeCatalogo[]> {
  const filas = await prisma.producto.findMany({
    where: { activo: true },
    select: {
      id: true,
      sku: true,
      codigoBarras: true,
      nombre: true,
      nombreBusqueda: true,
      categoriaId: true,
      precioVentaCentavos: true,
      stockMilesimas: true,
      stockMinimoMilesimas: true,
      unidad: true,
      categoria: { select: { nombre: true, color: true } },
    },
    orderBy: { nombre: 'asc' },
  });

  return filas.map((fila) => ({
    id: fila.id,
    sku: fila.sku,
    codigoBarras: fila.codigoBarras,
    nombre: fila.nombre,
    nombreBusqueda: fila.nombreBusqueda,
    categoriaId: fila.categoriaId,
    categoria: fila.categoria.nombre,
    color: fila.categoria.color,
    precioVentaCentavos: fila.precioVentaCentavos,
    stockMilesimas: fila.stockMilesimas,
    stockMinimoMilesimas: fila.stockMinimoMilesimas,
    unidad: fila.unidad,
  }));
}

export function listarCategorias() {
  return prisma.categoria.findMany({ orderBy: { orden: 'asc' } });
}

export function listarProveedores() {
  return prisma.proveedor.findMany({ orderBy: { nombre: 'asc' } });
}

export function buscarPorId(id: string, cliente: ClientePrisma = prisma) {
  return cliente.producto.findUnique({ where: { id } });
}

export function buscarVariosPorId(ids: readonly string[], cliente: ClientePrisma = prisma) {
  return cliente.producto.findMany({ where: { id: { in: [...ids] } } });
}

export function buscarPorCodigoBarras(codigo: string) {
  return prisma.producto.findUnique({ where: { codigoBarras: codigo } });
}

export function buscarPorSku(sku: string) {
  return prisma.producto.findUnique({ where: { sku } });
}

export interface FiltroListado {
  texto: string;
  categoriaId: string | null;
  soloBajoMinimo: boolean;
  pagina: number;
  porPagina: number;
}

export async function listarPaginado(filtro: FiltroListado) {
  const donde: Prisma.ProductoWhereInput = {};
  if (filtro.texto) {
    // La comparación va contra `nombreBusqueda`, que ya está sin acentos y en
    // minúsculas: SQLite no sabe ignorar acentos por su cuenta.
    const texto = normalizarParaBuscar(filtro.texto);
    donde.OR = [
      { nombreBusqueda: { contains: texto } },
      { sku: { contains: filtro.texto } },
      { codigoBarras: { contains: filtro.texto } },
    ];
  }
  if (filtro.categoriaId) donde.categoriaId = filtro.categoriaId;

  const [total, filas] = await Promise.all([
    prisma.producto.count({ where: donde }),
    prisma.producto.findMany({
      where: donde,
      include: { categoria: true, proveedor: true },
      orderBy: { nombre: 'asc' },
      skip: (filtro.pagina - 1) * filtro.porPagina,
      take: filtro.porPagina,
    }),
  ]);

  // El filtro de "bajo el mínimo" compara dos columnas de la misma fila, y eso
  // Prisma no lo expresa: se resuelve en memoria sobre la página pedida.
  const visibles = filtro.soloBajoMinimo
    ? filas.filter((fila) => fila.stockMilesimas < fila.stockMinimoMilesimas)
    : filas;

  return { total, filas: visibles };
}

/** Los productos bajo el mínimo, para la alerta. Consulta cruda por lo mismo. */
export function listarBajoMinimo(limite = 50) {
  return prisma.$queryRaw<
    {
      id: string;
      sku: string;
      nombre: string;
      unidad: string;
      stock_milesimas: number;
      stock_minimo_milesimas: number;
    }[]
  >`
    SELECT id, sku, nombre, unidad, stock_milesimas, stock_minimo_milesimas
    FROM producto
    WHERE activo = 1 AND stock_milesimas < stock_minimo_milesimas
    ORDER BY (stock_milesimas - stock_minimo_milesimas) ASC
    LIMIT ${limite}
  `;
}

export function contarBajoMinimo() {
  return prisma.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*) AS total FROM producto
    WHERE activo = 1 AND stock_milesimas < stock_minimo_milesimas
  `;
}

export interface DatosProductoPersistible {
  sku: string;
  codigoBarras: string | null;
  nombre: string;
  categoriaId: string;
  proveedorId: string | null;
  precioVentaCentavos: number;
  precioCostoCentavos: number;
  stockMinimoMilesimas: number;
  unidad: string;
  activo: boolean;
}

export function crear(datos: DatosProductoPersistible) {
  return prisma.producto.create({
    data: { ...datos, nombreBusqueda: normalizarParaBuscar(datos.nombre), stockMilesimas: 0 },
  });
}

export function actualizar(id: string, datos: DatosProductoPersistible) {
  return prisma.producto.update({
    where: { id },
    data: { ...datos, nombreBusqueda: normalizarParaBuscar(datos.nombre) },
  });
}

/**
 * Descuento de stock atómico. `decrement` lo resuelve la base en un solo
 * UPDATE; leer, restar en JavaScript y volver a escribir pierde el descuento
 * de la otra caja cuando las dos cobran el mismo producto al mismo tiempo.
 */
export function moverStock(
  id: string,
  cantidadMilesimas: number,
  cliente: ClientePrisma = prisma,
) {
  return cliente.producto.update({
    where: { id },
    data: { stockMilesimas: { increment: cantidadMilesimas } },
    select: { id: true, stockMilesimas: true },
  });
}
