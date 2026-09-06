import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * No se testea todo: se testea lo que, si se rompe, cuesta plata (§9).
 *
 * Por eso la cobertura se mide solo sobre la lógica de dinero y de formato, y
 * ahí se exige el 100%. Medir cobertura sobre toda la aplicación daría un
 * número grande y sin sentido, y taparía justo el archivo que importa.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/dinero.ts', 'src/lib/formato.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
