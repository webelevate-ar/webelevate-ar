import { z } from 'zod';
import {
  esquemaMetodoPago,
  esquemaRol,
  esquemaTipoMovimientoStock,
  esquemaUnidad,
} from './enums';

/**
 * Los esquemas viven acá, en un solo archivo, y los importan tanto el
 * formulario del navegador como el route handler (§7.4 y §8.2). Si estuvieran
 * duplicados, el día que cambie una regla va a cambiar en un lado solo.
 *
 * Los mensajes están escritos para que se lean debajo del campo: "El precio
 * tiene que ser mayor a 0", no "Valor inválido".
 */

const centavos = z
  .number()
  .int('El monto tiene que ser un número entero de centavos')
  .nonnegative('El monto no puede ser negativo')
  .max(100_000_000_000, 'El monto es demasiado grande');

const milesimas = z
  .number()
  .int('La cantidad tiene que ser un entero en milésimas')
  .max(1_000_000_000, 'La cantidad es demasiado grande');

// ─── Sesión ──────────────────────────────────────────────────────────────────

export const esquemaIngreso = z.object({
  usuarioId: z.string().min(1, 'Elegí un usuario'),
  pin: z
    .string()
    .regex(/^\d{4}$/, 'El PIN son 4 números'),
});
export type DatosIngreso = z.infer<typeof esquemaIngreso>;

// ─── Venta ───────────────────────────────────────────────────────────────────

export const esquemaItemVenta = z.object({
  productoId: z.string().min(1),
  cantidadMilesimas: milesimas.positive('La cantidad tiene que ser mayor a 0'),
});

export const esquemaPago = z.object({
  metodo: esquemaMetodoPago,
  montoCentavos: centavos.positive('Cada pago tiene que ser mayor a 0'),
});

export const esquemaCrearVenta = z.object({
  /**
   * La genera el navegador antes de enviar. Si el pedido se reintenta —y en
   * modo offline se reintenta— el servidor devuelve la venta ya creada en vez
   * de cobrar dos veces (§8.4).
   */
  claveIdempotencia: z.uuid('La clave de idempotencia tiene que ser un UUID'),
  items: z.array(esquemaItemVenta).min(1, 'La venta no puede estar vacía'),
  pagos: z.array(esquemaPago).min(1, 'Falta cargar el pago'),
  descuentoPorcentajeCentesimas: z
    .number()
    .int()
    .min(0, 'El descuento no puede ser negativo')
    .max(10_000, 'El descuento no puede pasar del 100 %')
    .default(0),
  clienteId: z.string().nullable().default(null),
  /** Solo se manda cuando hay descuento: lo tiene que autorizar un supervisor. */
  pinSupervisor: z.string().regex(/^\d{4}$/).nullable().default(null),
  /**
   * Cuándo se cobró, si se cobró sin conexión y estuvo en la cola local.
   * En una venta normal es `null` y no cambia nada.
   */
  cobradaSinConexionEn: z.iso.datetime().nullable().default(null),
  /**
   * Lo que el cajero le cobró al cliente con el precio que tenía el espejo del
   * catálogo en ese momento. **No se usa para cobrar**: el total lo recalcula
   * el servidor igual que siempre. Sirve para una sola cosa, que es comparar:
   * si el precio cambió entre el cobro y la sincronización, la diferencia queda
   * registrada en auditoría en vez de desaparecer.
   */
  totalCobradoCentavos: centavos.nullable().default(null),
});
export type DatosCrearVenta = z.infer<typeof esquemaCrearVenta>;

export const esquemaAnularVenta = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, 'Escribí el motivo de la anulación, al menos 5 caracteres')
    .max(300, 'El motivo es demasiado largo'),
});

// ─── Caja ────────────────────────────────────────────────────────────────────

export const esquemaAbrirCaja = z.object({
  cajaNumero: z
    .number()
    .int()
    .min(1, 'El número de caja tiene que ser 1 o mayor')
    .max(9, 'El número de caja no puede pasar de 9'),
  montoInicialCentavos: centavos,
});

export const esquemaCerrarCaja = z.object({
  /** Lo que el cajero contó. Se pide sin mostrarle lo esperado: arqueo ciego. */
  montoDeclaradoCentavos: centavos,
});

export const esquemaMovimientoCaja = z.object({
  tipo: z.enum(['retiro', 'ingreso']),
  montoCentavos: centavos.positive('El monto tiene que ser mayor a 0'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Escribí un motivo, al menos 3 caracteres')
    .max(200, 'El motivo es demasiado largo'),
});

// ─── Catálogo ────────────────────────────────────────────────────────────────

export const esquemaProducto = z.object({
  sku: z
    .string()
    .trim()
    .min(2, 'El código interno tiene que tener al menos 2 caracteres')
    .max(40, 'El código interno es demasiado largo'),
  codigoBarras: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, 'El código de barras son entre 8 y 14 números')
    .nullable()
    .default(null),
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre tiene que tener al menos 2 caracteres')
    .max(120, 'El nombre es demasiado largo'),
  categoriaId: z.string().min(1, 'Elegí una categoría'),
  proveedorId: z.string().nullable().default(null),
  precioVentaCentavos: centavos.positive('El precio de venta tiene que ser mayor a 0'),
  precioCostoCentavos: centavos,
  stockMinimoMilesimas: milesimas.nonnegative('El stock mínimo no puede ser negativo'),
  unidad: esquemaUnidad,
  activo: z.boolean().default(true),
});
export type DatosProducto = z.infer<typeof esquemaProducto>;

export const esquemaMovimientoStock = z.object({
  productoId: z.string().min(1),
  tipo: esquemaTipoMovimientoStock.exclude(['venta']),
  /** Firmada: negativa descuenta. Un ajuste puede ir para cualquier lado. */
  cantidadMilesimas: milesimas.refine((valor) => valor !== 0, 'La cantidad no puede ser 0'),
  motivo: z
    .string()
    .trim()
    .min(3, 'Escribí un motivo, al menos 3 caracteres')
    .max(200, 'El motivo es demasiado largo'),
});

// ─── Filtros de listado ──────────────────────────────────────────────────────

export const esquemaFiltroVentas = z.object({
  desde: z.string().nullable().default(null),
  hasta: z.string().nullable().default(null),
  estado: z.enum(['completada', 'anulada', 'todas']).default('todas'),
  usuarioId: z.string().nullable().default(null),
  cajaSesionId: z.string().nullable().default(null),
  texto: z.string().trim().default(''),
  pagina: z.coerce.number().int().min(1).default(1),
});
export type FiltroVentas = z.infer<typeof esquemaFiltroVentas>;

export const esquemaFiltroProductos = z.object({
  texto: z.string().trim().default(''),
  categoriaId: z.string().nullable().default(null),
  soloBajoMinimo: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((valor) => valor === true || valor === 'true')
    .default(false),
  pagina: z.coerce.number().int().min(1).default(1),
});
export type FiltroProductos = z.infer<typeof esquemaFiltroProductos>;

export const esquemaCrearUsuario = z.object({
  nombre: z.string().trim().min(2, 'El nombre tiene que tener al menos 2 caracteres'),
  pin: z.string().regex(/^\d{4}$/, 'El PIN son 4 números'),
  rol: esquemaRol,
});
