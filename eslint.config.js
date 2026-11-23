/**
 * ESLint 9 flat config — issue #7.
 *
 * Reglas serias pero **no discutibles**: nada de formato (eso no es un bug) ni estilo.
 * El gate es para lo que rompe en silencio: variables sin usar y `console` que se cuela a producción.
 *
 * Cobertura: `apps/**` y `packages/**`. Quedan fuera:
 *   - `supabase/functions` — Deno, tiene su propio lint.
 *   - `apps/web/public`    — service worker crudo; `self`/`caches` son globals del navegador.
 *   - `scripts/*.mjs`      — herramientas de proceso que imprimen a propósito en la terminal.
 *   - `tools/**`           — el compute de pruebas (#64): herramientas de proceso, mismo criterio,
 *                            con globals de Node que el flat config no declara (`process`, `Buffer`).
 *   - `dist/`, `node_modules`, `.worktrees` (copias del repo, no fuentes).
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '.worktrees/**',
      'supabase/functions/**',
      'apps/web/public/**',
      'scripts/**',
      'tools/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Un `_arg` de un callback no es un bug: el prefijo lo declara a propósito.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // El cliente PWA sólo debe loguear un fallo real, nunca trazas: `console.log` es rojo.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
);
