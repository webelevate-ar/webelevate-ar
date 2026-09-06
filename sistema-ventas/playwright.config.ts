import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * El contenedor trae Chromium instalado en `/opt/pw-browsers`. Si la versión de
 * Playwright no coincide con la revisión que hay ahí, `chromium.launch()` sale
 * a descargar una y el proxy lo bloquea; por eso se apunta al binario que ya
 * está cuando existe, y si no, se deja que Playwright resuelva como siempre.
 */
const CHROMIUM_DEL_CONTENEDOR = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/**
 * E2E de los flujos que, si se rompen, la venta no sale (§9).
 *
 * La resolución es 1366×768 porque es la PC de mostrador del §2, y el §12 pide
 * probar ahí sin scroll horizontal. Correrlo a 1920 escondería justamente el
 * problema que hay que buscar.
 *
 * Corre contra el build de producción (`next start`), no contra `next dev`: el
 * modo de desarrollo tiene otro comportamiento de hidratación y otros tiempos,
 * y probar contra algo que no es lo que se entrega no prueba nada.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1366, height: 768 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Cordoba',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        ...(existsSync(CHROMIUM_DEL_CONTENEDOR)
          ? { launchOptions: { executablePath: CHROMIUM_DEL_CONTENEDOR } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run start -- --port 3100 --hostname 127.0.0.1',
    url: 'http://127.0.0.1:3100/ingresar',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { NODE_ENV: 'production' },
  },
});
