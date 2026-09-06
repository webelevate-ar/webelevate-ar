import { manejar, respuestaOk } from '@/lib/api';
import { ErrorApp } from '@/lib/error-app';
import { buscarPorId } from '@/lib/servicios/ventas';
import { requerirSesion } from '@/lib/sesion';

export async function GET(_peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  return manejar(async () => {
    await requerirSesion();
    const { id } = await contexto.params;
    const venta = await buscarPorId(id);
    if (!venta) throw ErrorApp.noEncontrado('Esa venta no existe.');
    return respuestaOk({ venta });
  });
}
