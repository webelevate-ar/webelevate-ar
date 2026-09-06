'use client';

import { Boton } from '@/components/ui/boton';

/**
 * Teclado numérico en pantalla. Lo usa el ingreso por PIN, la carga de un
 * producto por peso y el arqueo.
 *
 * Los botones son grandes porque en el mostrador se toca con el dedo, y a la
 * vez el teclado físico sigue funcionando: nunca es la única forma de cargar
 * un número.
 */
export function TecladoNumerico({
  alEscribir,
  alBorrar,
  alLimpiar,
  alAceptar,
  textoAceptar = 'Aceptar',
  aceptarHabilitado = true,
  conComa = false,
}: {
  alEscribir: (digito: string) => void;
  alBorrar: () => void;
  alLimpiar?: () => void;
  alAceptar?: () => void;
  textoAceptar?: string;
  aceptarHabilitado?: boolean;
  conComa?: boolean;
}) {
  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="grid grid-cols-3 gap-3">
      {teclas.map((tecla) => (
        <Boton
          key={tecla}
          type="button"
          tamano="xl"
          variante="solido"
          onClick={() => alEscribir(tecla)}
          aria-label={`Número ${tecla}`}
        >
          {tecla}
        </Boton>
      ))}

      {conComa ? (
        <Boton type="button" tamano="xl" variante="solido" onClick={() => alEscribir(',')}>
          ,
        </Boton>
      ) : (
        <Boton
          type="button"
          tamano="xl"
          variante="fantasma"
          onClick={alLimpiar}
          disabled={!alLimpiar}
        >
          Limpiar
        </Boton>
      )}

      <Boton
        type="button"
        tamano="xl"
        variante="solido"
        onClick={() => alEscribir('0')}
        aria-label="Número 0"
      >
        0
      </Boton>

      <Boton type="button" tamano="xl" variante="contorno" onClick={alBorrar} aria-label="Borrar">
        ←
      </Boton>

      {alAceptar ? (
        <Boton
          type="button"
          tamano="xl"
          variante="acento"
          className="col-span-3"
          onClick={alAceptar}
          disabled={!aceptarHabilitado}
        >
          {textoAceptar}
        </Boton>
      ) : null}
    </div>
  );
}
