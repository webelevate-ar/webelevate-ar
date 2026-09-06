'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { TecladoNumerico } from '@/components/pos/teclado-numerico';
import { Boton } from '@/components/ui/boton';
import { EsqueletoFilas, EstadoError } from '@/components/ui/estados';
import { api, mensajeDeError } from '@/lib/cliente-api';
import { cn } from '@/lib/utils';
import { NOMBRE_ROL, type Rol } from '@/lib/validacion/enums';

interface UsuarioParaElegir {
  id: string;
  nombre: string;
  rol: string;
}

/**
 * Ingreso por PIN.
 *
 * Se elige el usuario de una lista en vez de escribir un nombre: en el
 * mostrador hay tres personas y escribir el nombre son cuatro segundos por
 * turno. El PIN se puede teclear con el teclado físico o con el de pantalla.
 */
export function FormularioIngreso() {
  const router = useRouter();
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const usuarios = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => api.get<{ usuarios: UsuarioParaElegir[] }>('/api/usuarios'),
  });

  const ingreso = useMutation({
    mutationFn: (datos: { usuarioId: string; pin: string }) => api.post('/api/sesion', datos),
    onSuccess: () => {
      router.replace('/venta');
      router.refresh();
    },
    onError: (fallo) => {
      setError(mensajeDeError(fallo));
      setPin('');
    },
  });

  const enviarPin = ingreso.mutate;

  /**
   * Al llegar al cuarto dígito entra solo: pedirle además que apriete un botón
   * es un toque de más, cuarenta veces por día.
   *
   * El `ref` no es un detalle: sin él, este efecto se dispara en cada render
   * —el objeto de la mutación cambia de identidad cada vez— y el login se
   * manda en bucle. Pasó de verdad, y solo se ve corriendo la aplicación: el
   * build compila igual. Acá se recuerda qué PIN ya se mandó y no se repite.
   */
  const pinEnviadoRef = useRef<string | null>(null);

  useEffect(() => {
    if (pin.length === 0) {
      pinEnviadoRef.current = null;
      return;
    }
    if (pin.length !== 4 || !usuarioId) return;
    if (pinEnviadoRef.current === pin) return;

    pinEnviadoRef.current = pin;
    setError(null);
    enviarPin({ usuarioId, pin });
  }, [enviarPin, pin, usuarioId]);

  // El teclado físico escribe el PIN sin que haya que enfocar ningún campo.
  useEffect(() => {
    if (!usuarioId) return undefined;
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key >= '0' && evento.key <= '9') {
        setPin((actual) => (actual.length >= 4 ? actual : actual + evento.key));
      } else if (evento.key === 'Backspace') {
        setPin((actual) => actual.slice(0, -1));
      } else if (evento.key === 'Escape') {
        setUsuarioId(null);
        setPin('');
        setError(null);
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [usuarioId]);

  const usuarioElegido = usuarios.data?.usuarios.find((usuario) => usuario.id === usuarioId);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-xl text-texto">Sistema de ventas</h1>
          <p className="mt-2 text-sm text-texto-suave">
            {usuarioElegido ? `Hola, ${usuarioElegido.nombre}. Marcá tu PIN.` : 'Elegí tu usuario.'}
          </p>
        </header>

        {usuarios.isPending ? <EsqueletoFilas filas={3} /> : null}

        {usuarios.isError ? (
          <EstadoError
            titulo="No se pudo cargar la lista de usuarios"
            mensaje={mensajeDeError(usuarios.error)}
            alReintentar={() => void usuarios.refetch()}
          />
        ) : null}

        {usuarios.data && !usuarioId ? (
          <ul className="flex flex-col gap-3">
            {usuarios.data.usuarios.map((usuario) => (
              <li key={usuario.id}>
                <Boton
                  tamano="xl"
                  variante="solido"
                  anchoCompleto
                  className="justify-between"
                  onClick={() => setUsuarioId(usuario.id)}
                >
                  <span>{usuario.nombre}</span>
                  <span className="text-sm text-texto-tenue">
                    {NOMBRE_ROL[usuario.rol as Rol] ?? usuario.rol}
                  </span>
                </Boton>
              </li>
            ))}
          </ul>
        ) : null}

        {usuarioId ? (
          <div className="flex flex-col gap-6">
            <div
              className="flex justify-center gap-4"
              role="status"
              aria-label={`${pin.length} de 4 dígitos marcados`}
            >
              {[0, 1, 2, 3].map((posicion) => (
                <span
                  key={posicion}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-colors duration-100',
                    posicion < pin.length
                      ? 'border-acento bg-acento'
                      : 'border-borde-fuerte bg-superficie',
                  )}
                />
              ))}
            </div>

            {error ? (
              <p role="alert" className="text-center text-sm text-error">
                {error}
              </p>
            ) : null}

            <TecladoNumerico
              alEscribir={(digito) => setPin((actual) => (actual.length >= 4 ? actual : actual + digito))}
              alBorrar={() => setPin((actual) => actual.slice(0, -1))}
              alLimpiar={() => setPin('')}
            />

            <Boton
              variante="fantasma"
              anchoCompleto
              onClick={() => {
                setUsuarioId(null);
                setPin('');
                setError(null);
              }}
            >
              Cambiar de usuario
            </Boton>
          </div>
        ) : null}
      </div>
    </main>
  );
}
