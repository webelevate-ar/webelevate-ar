/**
 * Recalcula `Producto.stockMilesimas` desde los movimientos (§4).
 *
 * Existe porque el stock del producto es un cache: la verdad es la suma de
 * MovimientoStock. Sin este script, "el cache es derivado" es una intención;
 * con él, es algo que se puede comprobar en cualquier momento.
 *
 *   npm run bd:recalcular-stock          revisa y avisa
 *   npm run bd:recalcular-stock -- --arreglar   además corrige
 */


import 'dotenv/config';

// El cliente sale del mismo archivo que usa la aplicación: si el seed eligiera
// su propio adaptador, podría sembrar una base distinta de la que se sirve.
import { prisma } from '../src/lib/prisma';

async function main(): Promise<void> {
  const arreglar = process.argv.includes('--arreglar');

  const sumas = await prisma.movimientoStock.groupBy({
    by: ['productoId'],
    _sum: { cantidadMilesimas: true },
  });
  const esperadoPorProducto = new Map(
    sumas.map((fila) => [fila.productoId, fila._sum.cantidadMilesimas ?? 0]),
  );

  const productos = await prisma.producto.findMany({
    select: { id: true, sku: true, nombre: true, stockMilesimas: true },
  });

  const desviados = productos.filter(
    (producto) => producto.stockMilesimas !== (esperadoPorProducto.get(producto.id) ?? 0),
  );

  if (desviados.length === 0) {
    console.log(`${productos.length} productos revisados. El cache coincide con los movimientos.`);
    return;
  }

  console.log(`${desviados.length} producto(s) con el cache desviado:`);
  for (const producto of desviados) {
    const esperado = esperadoPorProducto.get(producto.id) ?? 0;
    console.log(
      `  ${producto.sku}  ${producto.nombre}: cache ${producto.stockMilesimas}, movimientos ${esperado}`,
    );
  }

  if (!arreglar) {
    console.log('\nNo se corrigió nada. Volvé a correr con --arreglar para escribir el valor real.');
    process.exitCode = 1;
    return;
  }

  for (const producto of desviados) {
    await prisma.producto.update({
      where: { id: producto.id },
      data: { stockMilesimas: esperadoPorProducto.get(producto.id) ?? 0 },
    });
  }
  console.log(`\n${desviados.length} producto(s) corregidos.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
