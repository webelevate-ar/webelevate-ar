import { leerCuerpo, leerQuery, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe, limitarPeticiones } from '@/lib/limite-peticiones';
import { crearVenta, listar, POR_PAGINA } from '@/lib/servicios/ventas';
import { requerirSesion } from '@/lib/sesion';
import { esquemaCrearVenta, esquemaFiltroVentas } from '@/lib/validacion/esquemas';

/** Historial de ventas, con los filtros en la query string (§7.5). */
export async function GET(peticion: Request) {
  return manejar(async () => {
    await requerirSesion();
    const filtro = validar(esquemaFiltroVentas, leerQuery(peticion));
    const { total, filas } = await listar(filtro);
    return respuestaOk({ total, ventas: filas, porPagina: POR_PAGINA });
  });
}

/**
 * Cobrar.
 *
 * Devuelve 200 y la venta original si la clave de idempotencia ya se usó, en
 * vez de 201 y una venta nueva: es lo que evita el cobro doble cuando el
 * navegador reintenta (§8.4).
 */
export async function POST(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirSesion();
    limitarPeticiones({ clave: `venta:${sesion.usuarioId}`, maximo: 120, ventanaMs: 60_000 });

    const datos = validar(esquemaCrearVenta, await leerCuerpo(peticion));
    const { venta, yaExistia } = await crearVenta(datos, sesion, ipDe(peticion));
    return respuestaOk({ venta, yaExistia }, yaExistia ? 200 : 201);
  });
}
