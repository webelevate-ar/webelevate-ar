'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/cliente-api';
import { borrarEspejo } from '@/lib/offline/almacen';
import { limpiarPaginasGuardadas } from '@/lib/offline/service-worker';
import { cn } from '@/lib/utils';
import { NOMBRE_ROL, type Rol } from '@/lib/validacion/enums';
import { Boton } from '@/components/ui/boton';
import { EstadoOffline } from '@/components/pos/estado-offline';

/**
 * Barra de navegación. Es delgada a propósito: la pantalla de venta necesita
 * el alto, y a 1366×768 cada fila de 48px que se saca es una fila más de
 * carrito visible.
 */

interface Apartado {
  href: string;
  texto: string;
  soloSupervision?: boolean;
}

const APARTADOS: Apartado[] = [
  { href: '/venta', texto: 'Venta' },
  { href: '/caja', texto: 'Caja' },
  { href: '/historial', texto: 'Historial' },
  { href: '/catalogo', texto: 'Catálogo' },
  { href: '/stock', texto: 'Stock' },
  { href: '/panel', texto: 'Panel', soloSupervision: true },
];

export function BarraNavegacion({
  usuarioId,
  nombre,
  rol,
}: {
  usuarioId: string;
  nombre: string;
  rol: Rol;
}) {
  const ruta = usePathname();
  const router = useRouter();
  const supervisa = rol === 'ADMIN' || rol === 'SUPERVISOR';

  const salir = async () => {
    await api.delete('/api/sesion');
    /*
     * Lo guardado para el modo offline es de este cajero, y la caja es una PC
     * compartida: el espejo del catálogo y las páginas cacheadas se tiran al
     * salir. Las ventas pendientes **no**: llevan plata adentro y sobreviven al
     * cambio de turno hasta que se sincronicen o alguien las resuelva.
     */
    void borrarEspejo();
    limpiarPaginasGuardadas();
    router.replace('/ingresar');
    router.refresh();
  };

  return (
    <header className="no-imprimir flex h-12 shrink-0 items-center justify-between border-b border-borde bg-superficie px-4">
      <nav aria-label="Secciones">
        <ul className="flex items-center gap-1">
          {APARTADOS.filter((apartado) => !apartado.soloSupervision || supervisa).map((apartado) => {
            const activo = ruta === apartado.href || ruta.startsWith(`${apartado.href}/`);
            return (
              <li key={apartado.href}>
                <Link
                  href={apartado.href}
                  aria-current={activo ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center rounded-sm px-3 text-sm transition-colors duration-100',
                    activo
                      ? 'bg-superficie-alta text-texto'
                      : 'text-texto-suave hover:bg-superficie-alta hover:text-texto',
                  )}
                >
                  {apartado.texto}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-3">
        <EstadoOffline usuarioId={usuarioId} />
        <span className="text-sm text-texto-suave">
          {nombre} · <span className="text-texto-tenue">{NOMBRE_ROL[rol]}</span>
        </span>
        <Boton variante="fantasma" tamano="sm" onClick={() => void salir()}>
          Salir
        </Boton>
      </div>
    </header>
  );
}
