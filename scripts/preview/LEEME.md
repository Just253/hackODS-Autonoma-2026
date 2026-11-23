# Preview remoto de `apps/web/dist`

Un túnel, un puerto, un servidor. Lo que cambia con cada commit de `main` son
los archivos de `dist`, no los procesos: el servidor y cloudflared no se
reinician, así que la URL pública se mantiene.

## Arrancar, mirar, parar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/arrancar.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/tunel.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/parar.ps1
```

`arrancar.ps1` levanta, en orden: servidor estático (4173), watcher y túnel. Es
idempotente: si una pieza ya está viva, la reutiliza y no crea otra.

## Piezas

| Archivo | Qué hace |
|---|---|
| `servir.mjs` | HTTP puro (`node:http` + `node:fs`) sobre `apps/web/dist`: `/` a `index.html`, fallback SPA, `no-store`, 503 con `Retry-After` mientras el build reemplaza archivos. |
| `actualizar.mjs` | Cada 25 s: `git fetch origin main`, y si el SHA cambió, `git merge --ff-only`, `pnpm install --frozen-lockfile` solo si cambió `pnpm-lock.yaml`, `pnpm build`, y reescribe `dist/version.txt`. |
| `tunel.ps1` | `cloudflared tunnel --url http://127.0.0.1:4173` una sola vez. Si ya hay uno para ese puerto, imprime la URL guardada y sale. `-Reiniciar` lo cambia a propósito (la URL cambia). |
| `arrancar.ps1` | Servidor + watcher + túnel, en ese orden. |
| `parar.ps1` | Baja los tres. Descarta `tunel-url.txt` porque la URL muere con el proceso. |

## Artefactos de ejecución (no se commitean)

`preview.log` (una línea por ciclo), `tunel-url.txt`, `tunel.log`,
`*.pid`, `.estado.json`, `apps/web/dist/version.txt`.

## Probar el ciclo sin bucle

```powershell
node scripts/preview/actualizar.mjs --una-vez
```

Sale 0 si construyó o si no había nada nuevo; 1 si fetch/merge/install/build
fallaron. `--exigir-main` evita construir cuando HEAD tiene commits fuera de
`origin/main`.

## Requisitos

- Node 22 y pnpm 10.18.2 (ya en el repo).
- `cloudflared` en el PATH. Si falta: `winget install --id Cloudflare.cloudflared`.

## Riesgos

- **La URL es pública**: cualquiera con el enlace entra. Solo se sirven archivos
  estáticos de `apps/web/dist`; el Studio de Supabase no está detrás de este
  puerto ni debe estarlo.
- **Quick tunnel sin cuenta**: sin garantía de disponibilidad; si cloudflared se
  reinicia, la URL cambia. Por eso `tunel.ps1` no reinicia uno existente.
- **El primer hit puede tardar**: un nombre nuevo de trycloudflare puede quedar
  en caché negativa de DNS unos minutos. Es DNS, no el túnel.
- **Builds concurrentes**: `pnpm build` reescribe `dist`; durante ese instante
  algunas respuestas pueden ser 503 (el servidor no se cae). Dos builds a la vez
  sobre el mismo checkout pelean por `.turbo`.
- **Checkout compartido**: el watcher refleja `HEAD`, no `origin/main`. Si el
  checkout está en una rama, se ve en `preview.log` como `head_main=distinto`.
