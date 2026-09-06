'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Boton } from '@/components/ui/boton';
import { Campo } from '@/components/ui/campo';
import { Dialogo } from '@/components/ui/dialogo';
import { Aviso } from '@/components/ui/estados';
import { api, ErrorDeApi, mensajeDeError } from '@/lib/cliente-api';
import { parsearCantidadAMilesimas, parsearMontoACentavos } from '@/lib/dinero';
import { UNIDADES } from '@/lib/validacion/enums';
import { esquemaProducto, type DatosProducto } from '@/lib/validacion/esquemas';

/**
 * El esquema tiene campos con `.default()`, así que lo que entra al formulario
 * y lo que sale de la validación no son el mismo tipo: a la entrada esos
 * campos pueden faltar, a la salida ya están completos. `useForm` acepta los
 * dos por separado, y decirlo evita castear a `any` para tapar el error.
 */
type EntradaProducto = z.input<typeof esquemaProducto>;

export interface ProductoDelListado {
  id: string;
  sku: string;
  codigoBarras: string | null;
  nombre: string;
  categoriaId: string;
  proveedorId: string | null;
  precioVentaCentavos: number;
  precioCostoCentavos: number;
  stockMilesimas: number;
  stockMinimoMilesimas: number;
  unidad: string;
  activo: boolean;
  categoria: { nombre: string };
}

/**
 * Alta y edición de producto.
 *
 * El esquema de Zod es el mismo que valida el servidor, importado del mismo
 * archivo (§7.4). Si mañana cambia una regla, cambia en los dos lados a la vez
 * porque es un solo lugar.
 *
 * Los montos se escriben en pesos y se convierten a centavos acá: el formulario
 * es lo único que habla en pesos, de la conversión para adentro todo es entero.
 */
export function FormularioProducto({
  producto,
  categorias,
  proveedores,
  alCerrar,
  alGuardar,
}: {
  producto: ProductoDelListado | null;
  categorias: { id: string; nombre: string }[];
  proveedores: { id: string; nombre: string }[];
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);

  const formulario = useForm<EntradaProducto, unknown, DatosProducto>({
    resolver: zodResolver(esquemaProducto),
    // Al salir del campo, no en cada tecla: validar mientras se escribe pinta
    // el error antes de que la persona haya terminado de escribir (§7.4).
    mode: 'onBlur',
    defaultValues: producto
      ? {
          sku: producto.sku,
          codigoBarras: producto.codigoBarras,
          nombre: producto.nombre,
          categoriaId: producto.categoriaId,
          proveedorId: producto.proveedorId,
          precioVentaCentavos: producto.precioVentaCentavos,
          precioCostoCentavos: producto.precioCostoCentavos,
          stockMinimoMilesimas: producto.stockMinimoMilesimas,
          unidad: producto.unidad === 'kg' ? 'kg' : 'unidad',
          activo: producto.activo,
        }
      : {
          sku: '',
          codigoBarras: null,
          nombre: '',
          categoriaId: categorias[0]?.id ?? '',
          proveedorId: null,
          precioVentaCentavos: 0,
          precioCostoCentavos: 0,
          stockMinimoMilesimas: 0,
          unidad: 'unidad',
          activo: true,
        },
  });

  const guardado = useMutation({
    mutationFn: (datos: DatosProducto) =>
      producto ? api.put(`/api/productos/${producto.id}`, datos) : api.post('/api/productos', datos),
    onSuccess: alGuardar,
    onError: (fallo) => {
      // Los errores por campo que devuelve el servidor se pintan debajo del
      // campo que los causó, no en un cartel genérico arriba.
      if (fallo instanceof ErrorDeApi && fallo.detalles.length > 0) {
        for (const detalle of fallo.detalles) {
          formulario.setError(detalle.campo as keyof EntradaProducto, { message: detalle.mensaje });
        }
      }
      setErrorGeneral(mensajeDeError(fallo));
    },
  });

  const errores = formulario.formState.errors;

  return (
    <Dialogo
      abierto
      alCambiar={(estado) => {
        if (!estado) alCerrar();
      }}
      titulo={producto ? 'Editar producto' : 'Producto nuevo'}
      ancho="md"
    >
      <form
        className="grid grid-cols-2 gap-4"
        onSubmit={formulario.handleSubmit((datos) => {
          setErrorGeneral(null);
          guardado.mutate(datos);
        })}
      >
        <Campo
          etiqueta="Nombre"
          className="col-span-2"
          error={errores.nombre?.message}
          {...formulario.register('nombre')}
        />

        <Campo etiqueta="Código interno" error={errores.sku?.message} {...formulario.register('sku')} />

        <Campo
          etiqueta="Código de barras"
          error={errores.codigoBarras?.message}
          ayuda="Vacío para lo que se pesa o se hornea."
          {...formulario.register('codigoBarras', {
            setValueAs: (valor: string) => (valor.trim() === '' ? null : valor.trim()),
          })}
        />

        <Campo
          etiqueta="Precio de venta"
          inputMode="decimal"
          error={errores.precioVentaCentavos?.message}
          ayuda="En pesos."
          defaultValue={producto ? String(producto.precioVentaCentavos / 100) : ''}
          {...formulario.register('precioVentaCentavos', {
            setValueAs: (valor: string) => parsearMontoACentavos(valor) ?? 0,
          })}
        />

        <Campo
          etiqueta="Precio de costo"
          inputMode="decimal"
          error={errores.precioCostoCentavos?.message}
          ayuda="En pesos."
          defaultValue={producto ? String(producto.precioCostoCentavos / 100) : ''}
          {...formulario.register('precioCostoCentavos', {
            setValueAs: (valor: string) => parsearMontoACentavos(valor) ?? 0,
          })}
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="categoriaId" className="text-sm text-texto-suave">
            Categoría
          </label>
          <select
            id="categoriaId"
            className="h-12 rounded-sm border border-borde-fuerte bg-fondo px-4 text-base text-texto focus:border-info focus:outline-none"
            {...formulario.register('categoriaId')}
          >
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
          {errores.categoriaId ? (
            <p role="alert" className="text-sm text-error">
              {errores.categoriaId.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="proveedorId" className="text-sm text-texto-suave">
            Proveedor
          </label>
          <select
            id="proveedorId"
            className="h-12 rounded-sm border border-borde-fuerte bg-fondo px-4 text-base text-texto focus:border-info focus:outline-none"
            {...formulario.register('proveedorId', {
              setValueAs: (valor: string) => (valor === '' ? null : valor),
            })}
          >
            <option value="">Sin proveedor</option>
            {proveedores.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>
                {proveedor.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="unidad" className="text-sm text-texto-suave">
            Unidad
          </label>
          <select
            id="unidad"
            className="h-12 rounded-sm border border-borde-fuerte bg-fondo px-4 text-base text-texto focus:border-info focus:outline-none"
            {...formulario.register('unidad')}
          >
            {UNIDADES.map((unidad) => (
              <option key={unidad} value={unidad}>
                {unidad === 'kg' ? 'Por peso (kg)' : 'Por unidad'}
              </option>
            ))}
          </select>
        </div>

        <Campo
          etiqueta="Stock mínimo"
          inputMode="decimal"
          error={errores.stockMinimoMilesimas?.message}
          ayuda="En unidades o en kilos, según lo de al lado."
          defaultValue={producto ? String(producto.stockMinimoMilesimas / 1000) : ''}
          {...formulario.register('stockMinimoMilesimas', {
            setValueAs: (valor: string) => parsearCantidadAMilesimas(valor) ?? 0,
          })}
        />

        <label className="col-span-2 flex items-center gap-3 text-sm text-texto-suave">
          <input type="checkbox" className="h-5 w-5 accent-acento" {...formulario.register('activo')} />
          Activo. Al desactivarlo deja de aparecer en la venta, pero no se borra.
        </label>

        {errorGeneral ? (
          <div className="col-span-2">
            <Aviso tipo="error">{errorGeneral}</Aviso>
          </div>
        ) : null}

        <div className="col-span-2 flex gap-3">
          <Boton type="button" variante="fantasma" anchoCompleto onClick={alCerrar}>
            Cancelar
          </Boton>
          {/* Solo se deshabilita mientras se envía. Nunca por formulario
              incompleto: eso esconde el motivo (§7.4). */}
          <Boton type="submit" variante="acento" anchoCompleto disabled={guardado.isPending}>
            {guardado.isPending ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
