/**
 * Nombre legible de cada acción auditada.
 *
 * Vive en un archivo sin dependencias a propósito: lo usan la pantalla del
 * panel (que corre en el navegador) y el servidor. Cuando esto estaba dentro
 * del servicio de auditoría, importarlo desde la pantalla arrastraba Prisma
 * entero al bundle del cliente y el build se caía con "Can't resolve 'fs'".
 * La regla del §8.1 —el componente no habla con el servicio— tiene esta
 * consecuencia concreta, no es una preferencia de estilo.
 */
export const NOMBRE_ACCION: Record<string, string> = {
  anulacion_venta: 'Anulación de venta',
  descuento_manual: 'Descuento manual',
  retiro_caja: 'Retiro de caja',
  ingreso_caja: 'Ingreso de caja',
  cierre_caja_con_diferencia: 'Cierre de caja con diferencia',
  cambio_precio: 'Cambio de precio',
  alta_producto: 'Alta de producto',
  baja_producto: 'Baja de producto',
  stock_ingreso: 'Ingreso de mercadería',
  stock_ajuste: 'Ajuste de stock',
  stock_merma: 'Merma',
  stock_devolucion: 'Devolución a stock',
};
