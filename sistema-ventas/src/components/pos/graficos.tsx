'use client';

import { useId, useState, type ReactNode } from 'react';
import { Boton } from '@/components/ui/boton';
import { cn } from '@/lib/utils';

/**
 * Los tres gráficos del panel.
 *
 * Decisiones que vale la pena dejar escritas, porque son las que se pierden
 * cuando alguien "mejora" el gráfico más adelante:
 *
 *  · Una sola serie por gráfico, y por lo tanto un solo color y sin leyenda.
 *    Pintar cada barra de un color distinto según su altura codifica dos veces
 *    lo mismo y no agrega información.
 *  · Barras finas, tope redondeado y base cuadrada, con 2px de aire entre
 *    vecinas. La separación la hace el hueco, no un borde dibujado.
 *  · La grilla es una línea de un solo tono por encima del fondo, continua.
 *    Punteada leería como "proyección" cuando es solo una guía.
 *  · Se etiqueta el máximo, no todos los puntos. Un número sobre cada barra es
 *    ruido y no lo lee nadie.
 *  · Todo gráfico tiene su tabla equivalente, a un botón de distancia: el valor
 *    exacto nunca queda encerrado en un tooltip.
 */

const ALTO = 180;
const GROSOR_MAXIMO = 24;
const HUECO = 2;

export interface PuntoDeGrafico {
  clave: string;
  etiqueta: string;
  valor: number;
  /** Texto ya formateado, para la tabla y el tooltip. */
  valorTexto: string;
}

function ejeSuperior(maximo: number): number {
  if (maximo <= 0) return 1;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  return Math.ceil(maximo / magnitud) * magnitud;
}

/** Barra con las esquinas de arriba redondeadas y la base recta. */
function caminoColumna(x: number, y: number, ancho: number, alto: number, radio: number): string {
  const r = Math.min(radio, ancho / 2, alto);
  return [
    `M ${x} ${y + alto}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + ancho - r} ${y}`,
    `Q ${x + ancho} ${y} ${x + ancho} ${y + r}`,
    `L ${x + ancho} ${y + alto}`,
    'Z',
  ].join(' ');
}

export function TarjetaGrafico({
  titulo,
  descripcion,
  datos,
  columnaEtiqueta,
  columnaValor,
  children,
}: {
  titulo: string;
  descripcion?: string;
  datos: readonly PuntoDeGrafico[];
  columnaEtiqueta: string;
  columnaValor: string;
  children: ReactNode;
}) {
  const [verTabla, setVerTabla] = useState(false);
  const idTabla = useId();

  return (
    <section className="flex flex-col gap-4 rounded-md border border-borde bg-superficie p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base text-texto">{titulo}</h2>
          {descripcion ? <p className="mt-1 text-xs text-texto-tenue">{descripcion}</p> : null}
        </div>
        <Boton
          tamano="sm"
          variante="fantasma"
          aria-expanded={verTabla}
          aria-controls={idTabla}
          onClick={() => setVerTabla((actual) => !actual)}
        >
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </Boton>
      </header>

      {verTabla ? (
        <div id={idTabla} className="max-h-64 overflow-y-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-borde text-left text-texto-suave">
                <th className="py-2 font-normal">{columnaEtiqueta}</th>
                <th className="py-2 text-right font-normal">{columnaValor}</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((punto) => (
                <tr key={punto.clave} className="border-b border-borde last:border-b-0">
                  <td className="py-2 text-texto-suave">{punto.etiqueta}</td>
                  <td className="py-2 text-right text-texto">{punto.valorTexto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/** Columnas verticales: ventas por día y por hora. */
export function GraficoColumnas({
  datos,
  etiquetaCadaN = 1,
}: {
  datos: readonly PuntoDeGrafico[];
  etiquetaCadaN?: number;
}) {
  if (datos.length === 0) {
    return <p className="py-12 text-center text-sm text-texto-tenue">Sin datos en el período.</p>;
  }

  const ancho = 720;
  const margenIzquierdo = 8;
  const altoEje = 20;
  const tope = ejeSuperior(Math.max(...datos.map((punto) => punto.valor)));
  const banda = (ancho - margenIzquierdo * 2) / datos.length;
  const grosor = Math.max(2, Math.min(GROSOR_MAXIMO, banda - HUECO));
  const indiceMaximo = datos.reduce(
    (mejor, punto, indice) => ((datos[mejor]?.valor ?? 0) < punto.valor ? indice : mejor),
    0,
  );

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${ancho} ${ALTO + altoEje}`}
        role="img"
        aria-label={`Gráfico de columnas con ${datos.length} valores`}
        className="h-auto w-full min-w-2xl"
      >
        {/* Grilla: hairline continua, un tono por encima de la superficie. */}
        {[0, 0.5, 1].map((fraccion) => (
          <line
            key={fraccion}
            x1={0}
            x2={ancho}
            y1={ALTO - fraccion * ALTO}
            y2={ALTO - fraccion * ALTO}
            stroke="var(--color-borde)"
            strokeWidth={1}
          />
        ))}

        {datos.map((punto, indice) => {
          const alto = tope === 0 ? 0 : (punto.valor / tope) * (ALTO - 16);
          const x = margenIzquierdo + indice * banda + (banda - grosor) / 2;
          const y = ALTO - alto;
          return (
            <g key={punto.clave}>
              <path d={caminoColumna(x, y, grosor, alto, 4)} fill="var(--color-acento)" />
              {/* Área de acierto más grande que la barra: una columna de 6px es
                  imposible de apuntar con el mouse. */}
              <rect
                x={margenIzquierdo + indice * banda}
                y={0}
                width={banda}
                height={ALTO}
                fill="transparent"
              >
                <title>{`${punto.etiqueta}: ${punto.valorTexto}`}</title>
              </rect>
              {indice === indiceMaximo ? (
                <text
                  x={x + grosor / 2}
                  y={Math.max(10, y - 6)}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-texto-suave)"
                >
                  {punto.valorTexto}
                </text>
              ) : null}
              {indice % etiquetaCadaN === 0 ? (
                <text
                  x={x + grosor / 2}
                  y={ALTO + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-texto-tenue)"
                >
                  {punto.etiqueta}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barras horizontales: ranking de productos y reparto por método de pago. */
export function GraficoBarras({ datos }: { datos: readonly PuntoDeGrafico[] }) {
  if (datos.length === 0) {
    return <p className="py-12 text-center text-sm text-texto-tenue">Sin datos en el período.</p>;
  }

  const maximo = Math.max(...datos.map((punto) => punto.valor), 1);

  return (
    <ul className="flex flex-col gap-3">
      {datos.map((punto) => (
        <li key={punto.clave} className="flex flex-col gap-1" title={`${punto.etiqueta}: ${punto.valorTexto}`}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 truncate text-texto-suave">{punto.etiqueta}</span>
            <span className="shrink-0 text-texto">{punto.valorTexto}</span>
          </div>
          <div className="h-2 w-full rounded-sm bg-superficie-alta">
            <div
              className={cn('h-2 rounded-sm bg-acento')}
              style={{ width: `${Math.max(2, (punto.valor / maximo) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
