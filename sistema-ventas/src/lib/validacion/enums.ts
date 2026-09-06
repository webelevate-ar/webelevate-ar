import { z } from 'zod';

/**
 * SQLite no tiene enums. Esta es la lista válida de verdad: la usa Zod para
 * validar, TypeScript para tipar y el seed para generar. Si un valor no está
 * acá, no entra a la base, venga del cliente o del servidor.
 */

export const ROLES = ['ADMIN', 'SUPERVISOR', 'CAJERO'] as const;
export const esquemaRol = z.enum(ROLES);
export type Rol = z.infer<typeof esquemaRol>;

export const UNIDADES = ['unidad', 'kg'] as const;
export const esquemaUnidad = z.enum(UNIDADES);
export type Unidad = z.infer<typeof esquemaUnidad>;

export const TIPOS_MOVIMIENTO_STOCK = [
  'ingreso',
  'venta',
  'ajuste',
  'devolucion',
  'merma',
] as const;
export const esquemaTipoMovimientoStock = z.enum(TIPOS_MOVIMIENTO_STOCK);
export type TipoMovimientoStock = z.infer<typeof esquemaTipoMovimientoStock>;

export const TIPOS_MOVIMIENTO_CAJA = ['venta', 'retiro', 'ingreso', 'devolucion'] as const;
export const esquemaTipoMovimientoCaja = z.enum(TIPOS_MOVIMIENTO_CAJA);
export type TipoMovimientoCaja = z.infer<typeof esquemaTipoMovimientoCaja>;

export const METODOS_PAGO = ['efectivo', 'debito', 'credito', 'qr', 'cuenta_corriente'] as const;
export const esquemaMetodoPago = z.enum(METODOS_PAGO);
export type MetodoPago = z.infer<typeof esquemaMetodoPago>;

export const ESTADOS_VENTA = ['completada', 'anulada'] as const;
export const esquemaEstadoVenta = z.enum(ESTADOS_VENTA);
export type EstadoVenta = z.infer<typeof esquemaEstadoVenta>;

export const ESTADOS_CAJA = ['abierta', 'cerrada'] as const;
export const esquemaEstadoCaja = z.enum(ESTADOS_CAJA);
export type EstadoCaja = z.infer<typeof esquemaEstadoCaja>;

/** Cómo se escribe cada método de pago en la pantalla y en el ticket. */
export const NOMBRE_METODO_PAGO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  qr: 'QR',
  cuenta_corriente: 'Cuenta corriente',
};

export const NOMBRE_TIPO_MOVIMIENTO_STOCK: Record<TipoMovimientoStock, string> = {
  ingreso: 'Ingreso de mercadería',
  venta: 'Venta',
  ajuste: 'Ajuste',
  devolucion: 'Devolución',
  merma: 'Merma',
};

export const NOMBRE_TIPO_MOVIMIENTO_CAJA: Record<TipoMovimientoCaja, string> = {
  venta: 'Venta',
  retiro: 'Retiro',
  ingreso: 'Ingreso',
  devolucion: 'Devolución',
};

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CAJERO: 'Cajero',
};

/** El único método que mueve plata del cajón. El resto no entra al arqueo. */
export function afectaCaja(metodo: MetodoPago): boolean {
  return metodo === 'efectivo';
}
