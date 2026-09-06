import { leerCuerpo, leerQuery, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe } from '@/lib/limite-peticiones';
import { bajoMinimo, movimientosDeStock, registrarMovimientoStock } from '@/lib/servicios/catalogo';
import { requerirRol, requerirSesion, ROLES_SUPERVISION } from '@/lib/sesion';
import { esquemaMovimientoStock } from '@/lib/validacion/esquemas';

export async function GET(peticion: Request) {
  return manejar(async () => {
    await requerirSesion();
    const { productoId } = leerQuery(peticion);
    const [movimientos, alertas] = await Promise.all([
      movimientosDeStock(productoId),
      bajoMinimo(),
    ]);
    return respuestaOk({ movimientos, bajoMinimo: alertas });
  });
}

/** Ingresos, ajustes, mermas y devoluciones. Nunca ventas: esas las crea la venta. */
export async function POST(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirRol(ROLES_SUPERVISION);
    const datos = validar(esquemaMovimientoStock, await leerCuerpo(peticion));
    const resultado = await registrarMovimientoStock(datos, sesion, ipDe(peticion));
    return respuestaOk(resultado, 201);
  });
}
