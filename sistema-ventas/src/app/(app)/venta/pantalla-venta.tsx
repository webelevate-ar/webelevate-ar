'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuscadorProductos } from '@/components/pos/buscador-productos';
import { CarritoVenta } from '@/components/pos/carrito-venta';
import { DialogoDescuento } from '@/components/pos/dialogo-descuento';
import { DialogoPeso } from '@/components/pos/dialogo-peso';
import { PanelCobro, type PagoCargado } from '@/components/pos/panel-cobro';
import { VueltoPantallaCompleta } from '@/components/pos/vuelto-pantalla-completa';
import { GrillaProductos } from '@/components/pos/grilla-productos';
import { Boton } from '@/components/ui/boton';
import { Dialogo } from '@/components/ui/dialogo';
import { Aviso, EsqueletoGrilla, EstadoError } from '@/components/ui/estados';
import { useEstadoDeCaja } from '@/hooks/use-caja';
import {
  buscarEnCatalogo,
  useCatalogo,
  type CategoriaDeCatalogo,
  type ProductoDeCatalogo,
} from '@/hooks/use-catalogo';
import { useSonido } from '@/hooks/use-sonido';
import { api, mensajeDeError } from '@/lib/cliente-api';
import { formatearMoneda } from '@/lib/formato';
import { calcularTotales, useCarrito } from '@/store/carrito';
import type { Unidad } from '@/lib/validacion/enums';

interface VentaCreada {
  venta: {
    id: string;
    numero: number;
    totalCentavos: number;
    pagos: { metodo: string; montoCentavos: number; vueltoCentavos: number }[];
  };
  yaExistia: boolean;
}

/**
 * La pantalla de venta.
 *
 * Es la única pantalla que tiene que ser rápida; el resto alcanza con que esté
 * bien. Todo acá está puesto para que una venta de tres productos en efectivo
 * salga en menos de quince segundos sin tocar el mouse:
 *
 *   · el buscador está enfocado siempre, y vuelve a estarlo al cerrar cualquier
 *     cosa, porque el lector de códigos escribe donde esté el foco;
 *   · el catálogo está en memoria, así que filtrar no espera a la red;
 *   · no hay ni un modal de confirmación en el camino del cobro.
 */
export function PantallaVenta() {
  const clienteQuery = useQueryClient();
  const catalogo = useCatalogo();
  const caja = useEstadoDeCaja();
  const sonido = useSonido();

  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const [modo, setModo] = useState<'venta' | 'cobro'>('venta');
  const [pesando, setPesando] = useState<ProductoDeCatalogo | null>(null);
  const [descontando, setDescontando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [vuelto, setVuelto] = useState<{ centavos: number; numero: number } | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<VentaCreada['venta'] | null>(null);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);

  const buscadorRef = useRef<HTMLInputElement>(null);

  const items = useCarrito((estado) => estado.items);
  const indiceSeleccionado = useCarrito((estado) => estado.indiceSeleccionado);
  const descuentoPorcentaje = useCarrito((estado) => estado.descuentoPorcentajeCentesimas);
  const pinSupervisor = useCarrito((estado) => estado.pinSupervisor);
  const suspendidas = useCarrito((estado) => estado.suspendidas);
  const claveIdempotencia = useCarrito((estado) => estado.claveIdempotencia);
  const agregar = useCarrito((estado) => estado.agregar);
  const quitar = useCarrito((estado) => estado.quitar);
  const sumarUnidad = useCarrito((estado) => estado.sumarUnidad);
  const seleccionar = useCarrito((estado) => estado.seleccionar);
  const moverSeleccion = useCarrito((estado) => estado.moverSeleccion);
  const aplicarDescuento = useCarrito((estado) => estado.aplicarDescuento);
  const limpiar = useCarrito((estado) => estado.limpiar);
  const suspender = useCarrito((estado) => estado.suspender);
  const retomar = useCarrito((estado) => estado.retomar);

  const totales = useMemo(
    () => calcularTotales(items, descuentoPorcentaje),
    [items, descuentoPorcentaje],
  );

  // Con `?? []` a secas, el array sería nuevo en cada render y el `useMemo` de
  // la búsqueda no memorizaría nada: filtraría 400 productos en cada tecla.
  const VACIO = useMemo(() => [], []);
  const productos = catalogo.data?.productos ?? (VACIO as ProductoDeCatalogo[]);
  const categorias = catalogo.data?.categorias ?? (VACIO as CategoriaDeCatalogo[]);
  const { resultados, exacto } = useMemo(
    () => buscarEnCatalogo(productos, texto),
    [productos, texto],
  );

  const enfocarBuscador = useCallback(() => {
    // El `requestAnimationFrame` espera a que Radix devuelva el foco al cerrar
    // un diálogo; sin él, el foco vuelve al botón que lo abrió y el siguiente
    // escaneo se escribe en la nada.
    requestAnimationFrame(() => buscadorRef.current?.focus());
  }, []);

  const agregarProducto = useCallback(
    (producto: ProductoDeCatalogo, cantidadMilesimas?: number) => {
      if (producto.unidad === 'kg' && cantidadMilesimas === undefined) {
        setPesando(producto);
        return;
      }
      agregar(
        {
          productoId: producto.id,
          nombre: producto.nombre,
          sku: producto.sku,
          unidad: producto.unidad as Unidad,
          precioUnitarioCentavos: producto.precioVentaCentavos,
          stockMilesimas: producto.stockMilesimas,
        },
        cantidadMilesimas,
      );
      sonido.exito();
      setTexto('');
      setAviso(null);
      enfocarBuscador();
    },
    [agregar, enfocarBuscador, sonido],
  );

  const confirmarBusqueda = useCallback(() => {
    if (texto.trim() === '') return;
    const elegido = exacto ?? resultados[0];
    if (!elegido) {
      // Código no encontrado: aviso audible y visual, el campo se limpia solo y
      // queda enfocado. Nunca un modal que haya que cerrar (§6).
      sonido.error();
      setAviso(`No se encontró "${texto.trim()}".`);
      setTexto('');
      enfocarBuscador();
      return;
    }
    agregarProducto(elegido);
  }, [agregarProducto, enfocarBuscador, exacto, resultados, sonido, texto]);

  const cobro = useMutation({
    mutationFn: (pagos: PagoCargado[]) =>
      api.post<VentaCreada>('/api/ventas', {
        claveIdempotencia,
        items: items.map((item) => ({
          productoId: item.productoId,
          cantidadMilesimas: item.cantidadMilesimas,
        })),
        pagos,
        descuentoPorcentajeCentesimas: descuentoPorcentaje,
        clienteId: null,
        pinSupervisor,
      }),
    onSuccess: (respuesta) => {
      const vueltoTotal = respuesta.venta.pagos.reduce(
        (suma, pago) => suma + pago.vueltoCentavos,
        0,
      );
      setUltimaVenta(respuesta.venta);
      setVuelto({ centavos: vueltoTotal, numero: respuesta.venta.numero });
      setErrorCobro(null);
      setModo('venta');
      limpiar();
      void clienteQuery.invalidateQueries({ queryKey: ['caja'] });
      void clienteQuery.invalidateQueries({ queryKey: ['catalogo'] });
    },
    onError: (fallo) => setErrorCobro(mensajeDeError(fallo)),
  });

  const irACobrar = useCallback(() => {
    if (items.length === 0 || !caja.data?.sesion) return;
    setErrorCobro(null);
    setModo('cobro');
  }, [caja.data?.sesion, items.length]);

  // ─── Atajos de teclado (§6) ────────────────────────────────────────────────
  useEffect(() => {
    const hayDialogo = pesando !== null || descontando || cancelando || vuelto !== null;

    const alPresionar = (evento: KeyboardEvent) => {
      if (hayDialogo) return;

      switch (evento.key) {
        case 'F2':
          evento.preventDefault();
          if (modo === 'venta') irACobrar();
          break;
        case 'F3':
          evento.preventDefault();
          setTexto('');
          setAviso(null);
          enfocarBuscador();
          break;
        case 'F4': {
          evento.preventDefault();
          const item = items[indiceSeleccionado];
          if (!item) break;
          const producto = productos.find((fila) => fila.id === item.productoId);
          if (producto && producto.unidad === 'kg') setPesando(producto);
          break;
        }
        case 'F7': {
          evento.preventDefault();
          // Abre el primer resultado por peso que haya a mano; si no hay
          // búsqueda, deja la grilla en la primera categoría de fraccionado.
          const porPeso = resultados.find((producto) => producto.unidad === 'kg');
          if (porPeso) setPesando(porPeso);
          else enfocarBuscador();
          break;
        }
        case 'F8':
          evento.preventDefault();
          if (items.length > 0) setDescontando(true);
          break;
        case 'F9':
          evento.preventDefault();
          if (items.length > 0) {
            suspender();
            setTexto('');
            enfocarBuscador();
          }
          break;
        case 'Escape':
          evento.preventDefault();
          if (modo === 'cobro') {
            setModo('venta');
            enfocarBuscador();
          } else if (items.length > 0) {
            setCancelando(true);
          }
          break;
        case 'ArrowUp':
          if (modo === 'venta') {
            evento.preventDefault();
            moverSeleccion(-1);
          }
          break;
        case 'ArrowDown':
          if (modo === 'venta') {
            evento.preventDefault();
            moverSeleccion(1);
          }
          break;
        case '+':
          if (modo === 'venta' && indiceSeleccionado >= 0 && texto === '') {
            evento.preventDefault();
            sumarUnidad(indiceSeleccionado, 1);
          }
          break;
        case '-':
          if (modo === 'venta' && indiceSeleccionado >= 0 && texto === '') {
            evento.preventDefault();
            sumarUnidad(indiceSeleccionado, -1);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [
    cancelando,
    descontando,
    enfocarBuscador,
    indiceSeleccionado,
    irACobrar,
    items,
    modo,
    moverSeleccion,
    pesando,
    productos,
    resultados,
    sumarUnidad,
    suspender,
    texto,
    vuelto,
  ]);

  /**
   * El foco vuelve al buscador al entrar y al salir del cobro.
   *
   * `listoParaVender` es la parte que importa: mientras se ve el esqueleto, el
   * input todavía no existe y el `ref` está en null. Sin esta dependencia el
   * efecto corría una sola vez, contra la nada, y la pantalla arrancaba sin
   * foco — que es justo lo que rompe el primer escaneo del turno.
   */
  const listoParaVender = catalogo.isSuccess && Boolean(caja.data?.sesion);

  useEffect(() => {
    if (modo === 'venta' && listoParaVender) enfocarBuscador();
  }, [enfocarBuscador, listoParaVender, modo]);

  if (catalogo.isPending || caja.isPending) {
    return (
      <div className="grid h-[calc(100vh-3rem)] grid-cols-5">
        <div className="col-span-3 flex flex-col gap-4 p-4">
          <div className="esqueleto h-16 w-full rounded-sm" />
          <EsqueletoGrilla />
        </div>
        <div className="col-span-2 border-l border-borde bg-superficie p-4">
          <div className="esqueleto h-full w-full rounded-sm" />
        </div>
      </div>
    );
  }

  if (catalogo.isError) {
    return (
      <div className="p-6">
        <EstadoError
          titulo="No se pudo cargar el catálogo"
          mensaje={mensajeDeError(catalogo.error)}
          alReintentar={() => void catalogo.refetch()}
        />
      </div>
    );
  }

  if (!caja.data?.sesion) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg text-texto">No hay una caja abierta.</p>
        <p className="max-w-md text-sm text-texto-suave">
          Una venta sin caja no entra en ningún arqueo. Abrí la caja con el monto inicial y volvé
          a esta pantalla.
        </p>
        <Boton comoHijo variante="acento" tamano="lg">
          <Link href="/caja">Abrir la caja</Link>
        </Boton>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-5">
      {modo === 'cobro' ? (
        <div className="col-span-5">
          <PanelCobro
            totalCentavos={totales.totalCentavos}
            enviando={cobro.isPending}
            error={errorCobro}
            alConfirmar={(pagos) => cobro.mutate(pagos)}
            alCancelar={() => {
              setModo('venta');
              enfocarBuscador();
            }}
          />
        </div>
      ) : (
        <>
          <section className="col-span-3 flex min-h-0 flex-col gap-4 p-4">
            <BuscadorProductos
              ref={buscadorRef}
              texto={texto}
              alCambiar={(valor) => {
                setTexto(valor);
                setAviso(null);
              }}
              alConfirmar={confirmarBusqueda}
              resultados={texto.trim() === '' ? [] : resultados}
              alElegir={agregarProducto}
              aviso={aviso}
            />

            {suspendidas.length > 0 ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-xs text-texto-tenue">Ventas suspendidas:</span>
                {suspendidas.map((venta, indice) => (
                  <Boton
                    key={venta.id}
                    tamano="sm"
                    variante="contorno"
                    onClick={() => {
                      retomar(venta.id);
                      enfocarBuscador();
                    }}
                  >
                    #{indice + 1} · {venta.items.length} ítems
                  </Boton>
                ))}
              </div>
            ) : null}

            {texto.trim() === '' ? (
              <GrillaProductos
                productos={productos}
                categorias={categorias}
                categoriaActiva={categoriaActiva}
                alCambiarCategoria={setCategoriaActiva}
                alElegir={agregarProducto}
              />
            ) : null}

            <footer className="shrink-0 text-xs text-texto-tenue">
              F2 cobrar · F3 limpiar búsqueda · F4 editar peso · F7 por peso · F8 descuento ·
              F9 suspender · Esc cancelar · ↑↓ elegir · +/− cantidad
            </footer>
          </section>

          <div className="col-span-2 min-h-0">
            <CarritoVenta
              items={items}
              totales={totales}
              indiceSeleccionado={indiceSeleccionado}
              descuentoPorcentajeCentesimas={descuentoPorcentaje}
              alSeleccionar={seleccionar}
              alQuitar={quitar}
              alCambiarCantidad={sumarUnidad}
              alCobrar={irACobrar}
            />
          </div>
        </>
      )}

      {pesando ? (
        <DialogoPeso
          abierto
          nombre={pesando.nombre}
          precioPorKgCentavos={pesando.precioVentaCentavos}
          alCerrar={() => {
            setPesando(null);
            enfocarBuscador();
          }}
          alAceptar={(cantidadMilesimas) => {
            const producto = pesando;
            setPesando(null);
            agregarProducto(producto, cantidadMilesimas);
          }}
        />
      ) : null}

      <DialogoDescuento
        abierto={descontando}
        subtotalCentavos={totales.subtotalCentavos}
        pideAutorizacion
        alCerrar={() => {
          setDescontando(false);
          enfocarBuscador();
        }}
        alAplicar={(centesimas, pin) => {
          aplicarDescuento(centesimas, pin);
          setDescontando(false);
          enfocarBuscador();
        }}
      />

      <Dialogo
        abierto={cancelando}
        alCambiar={(estado) => {
          setCancelando(estado);
          if (!estado) enfocarBuscador();
        }}
        titulo="¿Cancelar la venta?"
        descripcion={`Se van a descartar ${items.length} ítem(s) por ${formatearMoneda(totales.totalCentavos)}.`}
        ancho="sm"
      >
        <div className="flex gap-3">
          <Boton
            variante="fantasma"
            anchoCompleto
            onClick={() => {
              setCancelando(false);
              enfocarBuscador();
            }}
          >
            Seguir con la venta
          </Boton>
          <Boton
            variante="peligro"
            anchoCompleto
            onClick={() => {
              limpiar();
              setTexto('');
              setCancelando(false);
              enfocarBuscador();
            }}
          >
            Cancelar la venta
          </Boton>
        </div>
      </Dialogo>

      {vuelto ? (
        <VueltoPantallaCompleta
          vueltoCentavos={vuelto.centavos}
          numeroVenta={vuelto.numero}
          alCerrar={() => {
            setVuelto(null);
            enfocarBuscador();
          }}
        />
      ) : null}

      {ultimaVenta && !vuelto ? (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-md border border-borde-fuerte bg-superficie-alta p-3 shadow-md">
          <Aviso tipo="exito" className="border-0 bg-transparent px-0 py-0">
            Venta {ultimaVenta.numero} · {formatearMoneda(ultimaVenta.totalCentavos)}
          </Aviso>
          <Boton comoHijo tamano="sm" variante="contorno">
            <a href={`/ticket/${ultimaVenta.numero}`} target="_blank" rel="noreferrer">
              Imprimir ticket
            </a>
          </Boton>
          <Boton tamano="sm" variante="fantasma" onClick={() => setUltimaVenta(null)}>
            Cerrar
          </Boton>
        </div>
      ) : null}
    </div>
  );
}
