'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/cliente-api';

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
}

export function useEstadoDeCaja() {
  return useQuery({
    queryKey: ['caja'],
    queryFn: () => api.get<EstadoDeCaja>('/api/caja'),
    // Los totales cambian con cada venta: no conviene servirlos de cache.
    staleTime: 0,
  });
}
