import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'src/generated/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // §17: `any` prohibido. Si hace falta, `unknown` y estrechar.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // §17: `console.log` como manejo de errores.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    // §8.1: un route handler nunca importa Prisma. La regla lo hace cumplir sola.
    files: ['src/app/**/route.ts', 'src/app/**/route.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Un route handler no toca Prisma. Llamá a un servicio de src/lib/servicios.',
            },
            {
              name: '@/lib/prisma',
              message:
                'Un route handler no toca Prisma. Llamá a un servicio de src/lib/servicios.',
            },
          ],
          patterns: [
            {
              group: ['@/lib/repositorios/*'],
              message:
                'Un route handler no llama al repositorio directo: pasa por un servicio.',
            },
          ],
        },
      ],
    },
  },
  {
    /*
     * Los componentes de cliente no hablan con la base ni con el servicio.
     * No es purismo: importar un servicio desde una pantalla arrastra Prisma
     * entero al bundle del navegador y el build se cae con "Can't resolve 'fs'".
     *
     * La convención de nombres es la que hace cumplir la regla: en `src/app`,
     * los archivos `pantalla-*.tsx` y `formulario-*.tsx` son componentes de
     * cliente; `page.tsx` y `layout.tsx` corren en el servidor y sí pueden
     * llamar a un servicio.
     */
    files: [
      'src/components/**/*.tsx',
      'src/app/**/pantalla-*.tsx',
      'src/app/**/formulario-*.tsx',
      'src/hooks/**/*.ts',
      'src/store/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@/lib/prisma', message: 'Un componente nunca toca Prisma.' }],
          patterns: [
            {
              group: ['@/lib/repositorios/*', '@/lib/servicios/*'],
              message: 'La lógica de negocio vive en un hook o en /lib, no en el componente.',
            },
          ],
        },
      ],
    },
  },
  {
    /*
     * El service worker no corre en una página: no tiene `window` ni `document`,
     * y sí tiene `self`, `caches` y `clients`. Sin declararlos acá, la regla de
     * variables no definidas marcaría como error el vocabulario propio del
     * entorno. Se declaran los que se usan y ninguno más.
     */
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Promise: 'readonly',
      },
    },
  },
  {
    files: ['prisma/**/*.ts', 'tests/**/*.ts', '*.config.*'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
