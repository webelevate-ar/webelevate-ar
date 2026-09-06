import { manejar, respuestaOk } from '@/lib/api';
import { catalogoCompleto, categorias } from '@/lib/servicios/catalogo';
import { requerirSesion } from '@/lib/sesion';

/**
 * El catálogo entero, de una sola vez.
 *
 * La búsqueda de producto tiene que responder en menos de 100ms (§7.7) y no
 * hay red que garantice eso por tecla. Se carga al iniciar sesión y se busca
 * en memoria: 400 productos con los campos justos son unos 80 KB.
 */
export async function GET() {
  return manejar(async () => {
    await requerirSesion();
    const [productos, listaCategorias] = await Promise.all([catalogoCompleto(), categorias()]);
    return respuestaOk({ productos, categorias: listaCategorias });
  });
}
