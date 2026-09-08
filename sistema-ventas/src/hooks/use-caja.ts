'use client';

import { useQuery } from '@tanstack/react-query';
import { api, ErrorDeApi } from '@/lib/cliente-api';
import { guardarEspejo, leerEspejo } from '@/lib/offline/almacen';

export interface SesionDeCaja {
  id: string;
  cajaNumero: number;
  usuarioId: string;
  abiertaEn: string;
  cerradaEn: string | null;
  montoInicialCentavos: number;
  montoDeclaradoCentavos: number | null;
  montoEsperadoCentavos: number | null;
  diferenciaCentavos: number | null;
  estado: string;
}

export interface TotalesDeCaja {
  ventasEfectivoCentavos: number;
  ingresosCentavos: number;
  retirosCentavos: number;
  devolucionesEfectivoCentavos: number;
  cantidadVentas: number;
  totalVendidoCentavos: number;
}

export interface EstadoDeCaja {
  sesion: SesionDeCaja | null;
  totales: TotalesDeCaja | null;
  /**
   * Cuándo se guardó la copia, si lo que se está usando es la copia. Los
   * totales de un espejo están viejos por definición —les faltan las ventas de
   * la cola— y la pantalla de caja lo dice antes de mostrarlos.
   */
  espejoDe: number | null;
}

const CLAVE_ESPEJO = 'caja';

interface EspejoCaja {
  sesion: SesionDeCaja | null;
  totales: TotalesDeCaja | null;
  guardadoEn: number;
}

function justificaEspejo(error: unknown): boolean {
  if (!(error instanceof ErrorDeApi)) return false;
  return error.status === 0 || error.status >= 500;
}

/**
 * El estado de la caja, con copia local.
 *
 * La copia parece un detalle y no lo es: la pantalla de venta **no deja cobrar
 * si no hay una caja abierta**, y sin conexión esta consulta falla. Sin espejo,
 * al cortarse internet la pantalla mostraría "no hay una caja abierta" con la
 * caja abierta, y el modo offline no serviría para nada.
 *
 * Que la caja siga abierta es una suposición razonable mientras no haya red: la
 * cierra el propio cajero desde esta misma PC, y esa acción sí necesita
 * conexión.
 */
export function useEstadoDeCaja() {
  return useQuery<EstadoDeCaja>({
    queryKey: ['caja'],
    queryFn: async () => {
      try {
        const datos = await api.get<Omit<EstadoDeCaja, 'espejoDe'>>('/api/caja');
        void guardarEspejo(CLAVE_ESPEJO, { ...datos, guardadoEn: Date.now() } satisfies EspejoCaja);
        return { ...datos, espejoDe: null };
      } catch (error) {
        if (!justificaEspejo(error)) throw error;
        const espejo = await leerEspejo<EspejoCaja>(CLAVE_ESPEJO);
        if (!espejo) throw error;
        return { sesion: espejo.sesion, totales: espejo.totales, espejoDe: espejo.guardadoEn };
      }
    },
    // Los totales cambian con cada venta: no conviene servirlos de cache.
    staleTime: 0,
    retry: false,
  });
}
