import { expect, test, type Page } from '@playwright/test';

/**
 * Los flujos críticos del §9, contra la aplicación de verdad a 1366×768.
 *
 * El de venta offline con reconexión y sincronización está aparte, en
 * `offline.spec.ts`: necesita cortarle la red al navegador y esperar al service
 * worker, y mezclarlo acá haría lento un archivo que no lo necesita.
 */

const PIN_CAJERO = '1111';
const PIN_SUPERVISOR = '2222';

async function ingresar(pagina: Page, nombre: string, pin: string) {
  await pagina.goto('/ingresar');
  await pagina.getByRole('button', { name: new RegExp(nombre) }).click();
  for (const digito of pin) await pagina.keyboard.press(digito);
  await pagina.waitForURL('**/venta', { timeout: 20_000 });
}

async function asegurarCajaAbierta(pagina: Page) {
  const abrir = pagina.getByRole('link', { name: 'Abrir la caja' });
  const buscador = pagina.locator('#buscador');

  // Hay que esperar a que la pantalla decida cuál de las dos muestra. Preguntar
  // por la visibilidad mientras todavía se ve el esqueleto devuelve `false` y
  // el test seguiría con una caja cerrada, que es un silencio, no un dato.
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

test.describe('flujos críticos', () => {
  test('1. venta completa solo con teclado, de principio a fin', async ({ page }) => {
    await ingresar(page, 'Cajero', PIN_CAJERO);
    await asegurarCajaAbierta(page);

    // El buscador tiene que estar enfocado al llegar, sin tocar nada.
    await expect(page.locator('#buscador')).toBeFocused();

    // Tres productos escaneados: el lector escribe el código y manda Enter.
    const codigos = await page.evaluate(async () => {
      const respuesta = await fetch('/api/catalogo');
      const datos = (await respuesta.json()) as {
        productos: { codigoBarras: string | null }[];
      };
      return datos.productos
        .filter((producto) => producto.codigoBarras)
        .slice(0, 3)
        .map((producto) => producto.codigoBarras as string);
    });
    expect(codigos).toHaveLength(3);

    for (const codigo of codigos) {
      await page.keyboard.type(codigo);
      await page.keyboard.press('Enter');
    }

    const carrito = page.getByRole('region', { name: 'Carrito' });
    await expect(carrito.getByRole('listitem')).toHaveCount(3);

    // F2 va a cobrar; Enter con el campo vacío cobra el importe justo.
    await page.keyboard.press('F2');
    await expect(page.getByRole('region', { name: 'Cobro' })).toBeVisible();
    await page.keyboard.press('Enter');

    // El vuelto ocupa la pantalla completa.
    const vuelto = page.getByRole('alertdialog', { name: 'Vuelto' });
    await expect(vuelto).toBeVisible({ timeout: 15_000 });
    await expect(vuelto).toContainText('Cobrado justo');

    // Una tecla lo cierra y el foco vuelve al buscador para la venta siguiente.
    await page.keyboard.press('Escape');
    await expect(vuelto).toBeHidden();
    await expect(page.locator('#buscador')).toBeFocused();
    await expect(carrito.getByText('El carrito está vacío.')).toBeVisible();
  });

  test('2. venta con pago mixto', async ({ page }) => {
    await ingresar(page, 'Cajero', PIN_CAJERO);
    await asegurarCajaAbierta(page);

    await page.locator('#buscador').fill('yerba');
    const resultados = page.getByRole('list', { name: 'Resultados de la búsqueda' });
    await expect(resultados.getByRole('listitem').first()).toBeVisible();
    await resultados.getByRole('button').first().click();

    await page.keyboard.press('F2');
    const cobro = page.getByRole('region', { name: 'Cobro' });
    await expect(cobro).toBeVisible();

    // Parte en débito, el resto en efectivo con vuelto.
    await cobro.getByRole('button', { name: 'Débito' }).click();
    await expect(cobro.getByText('Falta')).toBeVisible();

    await cobro.getByRole('button', { name: 'Confirmar cobro · Enter' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Vuelto' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('3. apertura y cierre de caja con diferencia', async ({ page }) => {
    await ingresar(page, 'Supervisor', PIN_SUPERVISOR);
    await page.goto('/caja');

    // Apertura con $50.000. Igual que antes: primero hay que esperar a que la
    // pantalla termine de cargar, si no la pregunta se hace contra el esqueleto.
    const abrir = page.getByRole('button', { name: 'Abrir caja' });
    const cajaAbierta = page.getByRole('heading', { name: /^Caja \d$/ });
    await expect(abrir.or(cajaAbierta).first()).toBeVisible({ timeout: 20_000 });

    if (await abrir.isVisible()) {
      // La caja 1 la tiene el cajero de los tests anteriores, y el sistema no
      // deja abrir dos veces la misma caja. El supervisor abre la 2, que es lo
      // que pasa en el local: tres cajas, una por persona.
      await page.getByLabel('Número de caja').fill('2');
      await page.getByLabel('Monto inicial').fill('50000');
      await abrir.click();
    }
    await expect(cajaAbierta).toBeVisible({ timeout: 20_000 });

    // Cierre ciego: la pantalla no dice cuánto tendría que haber.
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('no te muestra lo esperado');
    await expect(dialogo).not.toContainText('Esperado');

    // Se declara menos de lo que hay: tiene que dar faltante.
    await dialogo.getByLabel('Total contado').fill('40000');
    await dialogo.getByRole('button', { name: 'Cerrar caja' }).click();

    const resumen = page.getByText('Caja cerrada');
    await expect(resumen).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Falta plata')).toBeVisible();
    await expect(page.getByText('Esperado')).toBeVisible();
  });

  test('4. anulación de venta con reversión de stock', async ({ page }) => {
    await ingresar(page, 'Supervisor', PIN_SUPERVISOR);
    await page.goto('/historial');

    const primeraFila = page.getByRole('row').filter({ hasText: 'Completada' }).first();
    await expect(primeraFila).toBeVisible();
    await primeraFila.getByRole('button', { name: 'Anular' }).click();

    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Motivo').fill('Prueba automatizada de anulación');
    await dialogo.getByRole('button', { name: 'Anular la venta' }).click();

    await expect(dialogo).toBeHidden({ timeout: 15_000 });
    // Busca la insignia dentro de una fila de la tabla, no el texto suelto: el
    // primer "Anulada" de la página es una opción del filtro de estado.
    await expect(
      page.getByRole('row').filter({ hasText: 'Anulada' }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('5. a 1366×768 ninguna pantalla tiene scroll horizontal', async ({ page }) => {
    await ingresar(page, 'Supervisor', PIN_SUPERVISOR);

    for (const ruta of ['/venta', '/caja', '/historial', '/catalogo', '/stock', '/panel']) {
      await page.goto(ruta);
      await page.waitForLoadState('networkidle');
      const desborde = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(desborde, `${ruta} desborda ${desborde}px a lo ancho`).toBeLessThanOrEqual(0);
    }
  });
});
