import { notFound, redirect } from 'next/navigation';
import { buscarPorNumero } from '@/lib/servicios/ventas';
import { sesionActual } from '@/lib/sesion';
import { formatearCantidad, formatearFechaHora, formatearMoneda, formatearNumeroVenta } from '@/lib/formato';
import { NOMBRE_METODO_PAGO, type MetodoPago, type Unidad } from '@/lib/validacion/enums';
import { AutoImprimir } from './auto-imprimir';

/**
 * Ticket de 80mm.
 *
 * Se imprime por CSS (`@media print` en globals.css) y no con una librería:
 * la impresora térmica es una impresora común para el sistema operativo, y
 * cualquier capa intermedia es una cosa más que se puede romper en el
 * mostrador.
 *
 * ⚠️ Falta probarlo contra una impresora térmica real. La vista previa del
 * navegador respeta el ancho de 80mm, pero el corte de papel y los márgenes
 * del cabezal solo se ven imprimiendo (§15).
 */
export default async function PaginaTicket({ params }: { params: Promise<{ numero: string }> }) {
  const sesion = await sesionActual();
  if (!sesion) redirect('/ingresar');

  const { numero } = await params;
  if (!/^\d+$/.test(numero)) notFound();

  const venta = await buscarPorNumero(Number(numero));
  if (!venta) notFound();

  const vuelto = venta.pagos.reduce((suma, pago) => suma + pago.vueltoCentavos, 0);

  return (
    <>
      <AutoImprimir />
      <div className="ticket mx-auto max-w-md bg-superficie p-6 font-mono text-sm text-texto print:bg-white print:text-black">
        <header className="text-center">
          <p className="text-base">AUTOSERVICIO LA ESQUINA</p>
          <p>Av. Colón 1234 · Córdoba</p>
          <p>Comprobante no válido como factura</p>
        </header>

        <hr className="my-3 border-dashed border-borde" />

        <dl className="flex flex-col gap-1">
          <div className="flex justify-between">
            <dt>Venta</dt>
            <dd>{formatearNumeroVenta(venta.numero)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Fecha</dt>
            <dd>{formatearFechaHora(venta.creadoEn)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Caja</dt>
            <dd>
              {venta.cajaSesion.cajaNumero} · {venta.usuario.nombre}
            </dd>
          </div>
        </dl>

        <hr className="my-3 border-dashed border-borde" />

        <ul className="flex flex-col gap-2">
          {venta.items.map((item) => (
            <li key={item.id}>
              <p>{item.nombreSnapshot}</p>
              <p className="flex justify-between">
                <span>
                  {formatearCantidad(item.cantidadMilesimas, item.unidadSnapshot as Unidad)} ×{' '}
                  {formatearMoneda(item.precioUnitarioCentavos)}
                </span>
                <span>{formatearMoneda(item.subtotalCentavos)}</span>
              </p>
            </li>
          ))}
        </ul>

        <hr className="my-3 border-dashed border-borde" />

        <dl className="flex flex-col gap-1">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatearMoneda(venta.subtotalCentavos)}</dd>
          </div>
          {venta.descuentoCentavos > 0 ? (
            <div className="flex justify-between">
              <dt>Descuento</dt>
              <dd>−{formatearMoneda(venta.descuentoCentavos)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base">
            <dt>TOTAL</dt>
            <dd>{formatearMoneda(venta.totalCentavos)}</dd>
          </div>
        </dl>

        <hr className="my-3 border-dashed border-borde" />

        <dl className="flex flex-col gap-1">
          {venta.pagos.map((pago) => (
            <div key={pago.id} className="flex justify-between">
              <dt>{NOMBRE_METODO_PAGO[pago.metodo as MetodoPago] ?? pago.metodo}</dt>
              <dd>{formatearMoneda(pago.montoCentavos)}</dd>
            </div>
          ))}
          {vuelto > 0 ? (
            <div className="flex justify-between">
              <dt>Vuelto</dt>
              <dd>{formatearMoneda(vuelto)}</dd>
            </div>
          ) : null}
        </dl>

        {venta.estado === 'anulada' ? (
          <p className="mt-3 text-center">*** VENTA ANULADA ***</p>
        ) : null}

        <p className="mt-4 text-center">¡Gracias por su compra!</p>
      </div>
    </>
  );
}
