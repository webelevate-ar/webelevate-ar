/**
 * Generador pseudoaleatorio con semilla fija (mulberry32).
 *
 * `Math.random()` haría que cada corrida del seed diera un catálogo distinto,
 * y entonces un test que pasa hoy falla mañana sin que nadie haya tocado nada.
 * Con semilla fija, dos corridas dan exactamente los mismos datos.
 */
export function crearAleatorio(semilla: number) {
  let estado = semilla >>> 0;

  const siguiente = (): number => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** Float en [0, 1). */
    siguiente,
    /** Entero en [min, max], ambos incluidos. */
    entero: (min: number, max: number): number => min + Math.floor(siguiente() * (max - min + 1)),
    /** Un elemento del array. Lanza si está vacío, para que no devuelva `undefined`. */
    de: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('No se puede elegir de una lista vacía');
      return items[Math.floor(siguiente() * items.length)] as T;
    },
    /** `true` con la probabilidad dada (0 a 1). */
    conProbabilidad: (probabilidad: number): boolean => siguiente() < probabilidad,
    /**
     * Elige un índice según pesos relativos. Sirve para que las ventas caigan
     * más al mediodía y a las 19 que a las 8 de la mañana.
     */
    porPeso: (pesos: readonly number[]): number => {
      const total = pesos.reduce((suma, peso) => suma + peso, 0);
      let punto = siguiente() * total;
      for (let indice = 0; indice < pesos.length; indice += 1) {
        punto -= pesos[indice] ?? 0;
        if (punto <= 0) return indice;
      }
      return pesos.length - 1;
    },
  };
}

export type Aleatorio = ReturnType<typeof crearAleatorio>;
