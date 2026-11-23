# CU-01 · Abrir la PWA en modo avión

**Actor:** la cocinera, con la tablet de la olla y sin señal.
**Objetivo:** que la app abra y se pueda usar aunque no haya internet, y que recargar no la rompa.

**Guion:** 0:00 · **Área:** `web` · **Estado:** PR #16 (mergeado)

## Precondiciones

- La app se abrió al menos una vez con red, para que el service worker precachee el shell.
- El navegador soporta service workers (Chrome/Edge en la tablet).

## Flujo

1. Se activa el modo avión en la tablet.
2. Se abre la PWA instalada desde el ícono.
3. Aparece el inicio con el padrón del día, sin pantalla en blanco y sin errores de red.
4. Se recarga (gesto de recarga del navegador): sigue apareciendo lo mismo.

## Reglas que mandan

- `DEC-2026-0005` — el orden de los eventos es Lamport, nunca `Date.now()`; el shell se sirve cacheado.
- `DEC-2026-0007` — cero datos reales: lo que se cachea es ficticio y está marcado.
- Regla local de `apps/web/AGENTS.md`: la UI nunca bloquea por red.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Registro del SW | `apps/web/src/pwa/registro-sw.ts` | se registra también fuera de PROD |
| Contrato del SW | `apps/web/src/pwa/contrato-sw.ts` | una sola fuente: cache, shell, página offline, versión |
| Generación del SW | `apps/web/vite.config.ts` | en `generateBundle`, con los hashes reales del build |
| Precache | `dist/sw.js` | assets con hash + manifest + iconos (no una lista fija) |
| Fallback | `dist/sw.js` | navegación → network-first; sin red → `index.html` cacheado |

## Backend

No aplica en esta ventana: no hay llamada de red que sobreviva offline. El badge de sync es local (ver
`CU-08`).

## Criterio de aceptación

- [ ] `pnpm build` genera `dist/sw.js` con los assets **hasheados** del build, y `dist/index.html` con la
      versión del build inyectada.
- [ ] Con la red apagada y el servidor detenido, abrir y recargar muestra la app.
- [ ] Un build nuevo invalida el caché anterior (nombre de caché con versión).
- [ ] La versión instalada se ve en pantalla (para saber qué copia se está mirando).

## Prueba

```sh
pnpm --filter @hackods/web build
rg 'PRECACHE =' apps/web/dist/sw.js          # tiene que tener /assets/index-*.js con hash
rg 'name="version"' apps/web/dist/index.html # no puede decir "dev"
pnpm --filter @hackods/web test              # contrato-sw: precache, fallback, versión
pnpm verificar
```

Rojo→verde: volver a la lista fija de 5 URLs sin hash hace fallar el test del contrato y la recarga
offline deja de funcionar.

## Qué NO hace

- No sincroniza nada al volver la red (eso es `CU-08`).
- No cifra el almacenamiento local con PIN todavía (`DEC-2026-0005` lo pide; está fuera de la ventana).
- No funciona en el primer arranque sin red: el shell tiene que haberse cacheado una vez.

## Preguntas abiertas

- ¿`/offline.html` se precachea o se saca del build? Hoy se emite (`apps/web/vite.config.ts`), se define
  en `apps/web/src/pwa/contrato-sw.ts:120` y se sirve solo si el shell no está en caché
  (`contrato-sw.ts:186-192`).
- ¿La versión visible va en el pie de todas las pantallas o solo en inicio?
- ¿Qué pasa en iOS/Safari con el precache? Nadie lo probó todavía.
