import { expect, test, type Page } from '@playwright/test';

/**
 * El flujo crítico 3 del §9: vender sin conexión, reconectar y sincronizar.
 *
 * Es el único test de este proyecto que puede probar que el modo offline
 * funciona. Los unitarios cubren la cola y el almacén por separado; que la
 * pantalla cobre sin red, guarde la venta y la mande sola al volver la
 * conexión solo se ve corriéndolo.
 *
 * `context.setOffline(true)` corta la red del navegador de verdad: los `fetch`
 * fallan como fallan en el local cuando se cae el módem. No es un mock.
 */

const PIN_CAJERO = '1111';

async function ingresar(pagina: Page) {
  await pagina.goto('/ingresar');
  await pagina.getByRole('button', { name: /Cajero/ }).click();
  for (const digito of PIN_CAJERO) await pagina.keyboard.press(digito);
  await pagina.waitForURL('**/venta', { timeout: 20_000 });
}

async function asegurarCajaAbierta(pagina: Page) {
  const abrir = pagina.getByRole('link', { name: 'Abrir la caja' });
  const buscador = pagina.locator('#buscador');
  await expect(abrir.or(buscador).first()).toBeVisible({ timeout: 20_000 });

  if (await abrir.isVisible()) {
    await abrir.click();
    await pagina.getByLabel('Monto inicial').fill('50000');
    await pagina.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(pagina.getByRole('heading', { name: /^Caja \d$/ })).toBeVisible();
    await pagina.goto('/venta');
    await expect(buscador).toBeVisible({ timeout: 20_000 });
  }
}

/**
 * Espera a que el service worker tome el control y recarga una vez con red.
 *
 * Las dos cosas hacen falta y por razones distintas. El `controller` aparece
 * recién cuando el service worker se activó: cortar la red antes de eso deja la
 * recarga sin nadie que la conteste. Y la recarga con red es la que llena la
 * cache: los archivos que el navegador pidió **antes** de que el service worker
 * existiera no pasaron por él y no quedaron guardados.
 */
async function esperarServiceWorker(pagina: Page) {
  await pagina.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 30_000,
  });
  await pagina.reload();
  await expect(pagina.locator('#buscador')).toBeVisible({ timeout: 30_000 });
}

async function primerCodigo(pagina: Page): Promise<string> {
  const codigos = await pagina.evaluate(async () => {
    const respuesta = await fetch('/api/catalogo');
    const datos = (await respuesta.json()) as { productos: { codigoBarras: string | null }[] };
    return datos.productos
      .filter((producto) => producto.codigoBarras)
      .slice(0, 1)
      .map((producto) => producto.codigoBarras as string);
  });
  const codigo = codigos[0];
  if (!codigo) throw new Error('El catálogo no tiene ningún producto con código de barras');
  return codigo;
}

test.describe('flujo crítico 3: venta offline y sincronización', () => {
  test('cobra sin red, guarda la venta y la manda sola al reconectar', async ({
    page,
    context,
  }) => {
    await ingresar(page);
    await asegurarCajaAbierta(page);
    const codigo = await primerCodigo(page);

    // Una vuelta con conexión antes de cortar: es lo que deja guardados el
    // espejo del catálogo y la aplicación. Así funciona de verdad — el turno
    // arranca con internet y se corta en el medio.
    await esperarServiceWorker(page);

    const ventasAntes = await contarVentas(page);

    // ─── Se cae internet ────────────────────────────────────────────────────
    await context.setOffline(true);
    await page.reload();

    // La pantalla sigue sirviendo: catálogo del espejo y aviso de que no hay red.
    await expect(page.locator('#buscador')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/se está vendiendo con el catálogo de las/i)).toBeVisible({
      timeout: 30_000,
    });

    // Se cobra igual que siempre: escanear, F2, Enter. Ni una tecla distinta.
    await page.keyboard.type(codigo);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Carrito' }).getByRole('listitem')).toHaveCount(
      1,
    );

    await page.keyboard.press('F2');
    await expect(page.getByRole('region', { name: 'Cobro' })).toBeVisible();
    await page.keyboard.press('Enter');

    // El vuelto aparece igual, pero sin número: el número lo pone el servidor.
    const vuelto = page.getByRole('alertdialog', { name: 'Vuelto' });
    await expect(vuelto).toBeVisible({ timeout: 15_000 });
    await expect(vuelto).toContainText('Venta guardada sin conexión');
    await page.keyboard.press('Escape');

    // Y queda contada en la barra.
    await expect(page.getByText('1 sin sincronizar')).toBeVisible({ timeout: 15_000 });

    // ─── Vuelve internet ────────────────────────────────────────────────────
    await context.setOffline(false);

    /*
     * Se manda sola: no hay que apretar nada. Lo que se espera es que **se vaya
     * el aviso entero**, no que se vaya el texto "1 sin sincronizar".
     *
     * ⚠️ Esperar por ese texto estaba mal y costó encontrarlo: apenas arranca
     * el envío, ese cartel lo reemplaza "Sincronizando…", así que la condición
     * se cumplía **antes** de que la venta llegara al servidor y el test contaba
     * las ventas demasiado temprano. Fallaba por uno, contra PostgreSQL, con la
     * venta correctamente guardada en la base. Un cartel que desaparece no
     * prueba que algo terminó: puede haber sido reemplazado por otro.
     *
     * El aviso completo se va solo cuando no queda nada en cola, nada
     * rechazado, nada enviándose y hay conexión.
     */
    await expect(page.getByLabel('Ver las ventas sin sincronizar')).toBeHidden({
      timeout: 60_000,
    });

    const ventasDespues = await contarVentas(page);
    // Una, y una sola: la clave de idempotencia es lo que impide que un
    // reintento cobre dos veces.
    expect(ventasDespues).toBe(ventasAntes + 1);
  });

  test('la caja no se cierra con ventas sin sincronizar', async ({ page, context }) => {
    await ingresar(page);
    await asegurarCajaAbierta(page);
    const codigo = await primerCodigo(page);
    await esperarServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#buscador')).toBeVisible({ timeout: 30_000 });

    await page.keyboard.type(codigo);
    await page.keyboard.press('Enter');
    await page.keyboard.press('F2');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog', { name: 'Vuelto' })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('Escape');

    await page.goto('/caja');
    /*
     * Esto es lo que evita que el sistema le invente un faltante al cajero: el
     * arqueo compara contra lo que el servidor sabe, y una venta que todavía
     * está en esta PC no está en esa cuenta. Cerrar así dejaría el efectivo
     * como sobrante y quedaría escrito como diferencia de caja de esa persona.
     */
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeDisabled({
      timeout: 30_000,
    });
    await expect(page.getByText(/no se puede cerrar hasta que entren/i)).toBeVisible();

    // Al volver la conexión y sincronizar, el cierre se habilita solo.
    await context.setOffline(false);
    await expect(page.getByRole('button', { name: 'Cerrar caja' })).toBeEnabled({
      timeout: 60_000,
    });
  });
});

/**
 * ⚠️ `cache: 'no-store'` no es decorativo.
 *
 * Sin eso, la segunda llamada a esta misma URL vuelve de la cache del navegador
 * con el número de antes, y el test falla diciendo que la venta no entró cuando
 * sí entró. Pasó: la venta 1505 estaba en la base y el test la daba por perdida.
 */
async function contarVentas(pagina: Page): Promise<number> {
  return pagina.evaluate(async () => {
    const respuesta = await fetch('/api/ventas?pagina=1', { cache: 'no-store' });
    const datos = (await respuesta.json()) as { total: number };
    return datos.total;
  });
}
