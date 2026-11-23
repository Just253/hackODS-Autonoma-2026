/**
 * ¿Qué cambió en esta rama, y alcanza con mirar la documentación?
 *
 * Vive aparte de `verificar.mjs` para poder probar la regla sin depender de que el propio script sea
 * el cambio que se está midiendo.
 */
import { spawnSync } from 'node:child_process';

/** Si alguno de estos patrones aparece en el diff, hay código (o configuración que lo compila). */
export const PATRON_CODIGO = new RegExp(
  [
    '^(apps|packages|supabase|scripts)/',
    '^package\\.json$',
    '^pnpm-lock\\.yaml$',
    '^pnpm-workspace\\.yaml$',
    '^turbo\\.json$',
    '^tsconfig[^/]*\\.json$',
    '^\\.github/workflows/',
    '^\\.github/actions/',
    '^\\.githooks/',
    // Configuración que cambia cómo compila o corre el código: si se toca, hay que verificar de más.
    '^\\.nvmrc$',
    '^\\.node-version$',
    '^Dockerfile$',
    '^[Dd]ocker-compose[^/]*\\.ya?ml$',
    '^(vite|vitest|jest|eslint|prettier|postcss|tailwind|playwright|tsup|rollup)\\.config\\.[cm]?[jt]s$',
  ].join('|'),
);

/**
 * Sólo documentación si hay cambios y **ninguno** es código.
 * Lista vacía devuelve `false`: sin diff calculable se corre todo, que es el lado seguro.
 */
export function soloDocumentacion(archivos) {
  return archivos.length > 0 && !archivos.some((f) => PATRON_CODIGO.test(f));
}

/**
 * Archivos del cambio contra la base.
 *
 * Compara por contenido (`base`), no por ancestro (`base...HEAD`): una rama que sale de un commit ya
 * mergeado con squash re-expone cambios ajenos en el diff de tres puntos y convierte un PR de docs en
 * "código". Devuelve `null` si no se pudo calcular.
 */
export function archivosDelCambio(raiz, base = process.env.BASE_REF ?? 'origin/main') {
  for (const rango of [base, `${base}...HEAD`]) {
    const r = spawnSync('git', ['diff', '--name-only', rango], {
      cwd: raiz,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (r.status === 0) {
      return r.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    }
  }
  return null;
}
