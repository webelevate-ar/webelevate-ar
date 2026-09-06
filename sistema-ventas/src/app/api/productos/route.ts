import { leerCuerpo, leerQuery, manejar, respuestaOk, validar } from '@/lib/api';
import { ipDe } from '@/lib/limite-peticiones';
import {
  categorias,
  crear,
  listar,
  POR_PAGINA,
  proveedores,
} from '@/lib/servicios/catalogo';
import { requerirRol, requerirSesion, ROLES_SUPERVISION } from '@/lib/sesion';
import { esquemaFiltroProductos, esquemaProducto } from '@/lib/validacion/esquemas';

export async function GET(peticion: Request) {
  return manejar(async () => {
    await requerirSesion();
    const filtro = validar(esquemaFiltroProductos, leerQuery(peticion));
    const [{ total, filas }, listaCategorias, listaProveedores] = await Promise.all([
      listar(filtro),
      categorias(),
      proveedores(),
    ]);
    return respuestaOk({
      total,
      productos: filas,
      categorias: listaCategorias,
      proveedores: listaProveedores,
      porPagina: POR_PAGINA,
    });
  });
}

export async function POST(peticion: Request) {
  return manejar(async () => {
    const sesion = await requerirRol(ROLES_SUPERVISION);
    const datos = validar(esquemaProducto, await leerCuerpo(peticion));
    return respuestaOk({ producto: await crear(datos, sesion, ipDe(peticion)) }, 201);
  });
}
