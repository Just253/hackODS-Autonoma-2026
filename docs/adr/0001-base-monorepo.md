# ADR 0001 — Base del monorepo (ensamblado del esqueleto)

- **Estado:** aceptado
- **Fecha:** 2026-11-23
- **Decisores:** ensamblado inicial (base para las 3 personas)
- **Issues:** ninguno todavía (M0, issue `[infra] Monorepo, CI, labels, plantillas`)
- **Spec:** `docs/ARQUITECTURA.md` (2.x, 3.x, 9.x), `docs/PLAN.md` (M0)

## Contexto

El repo estaba vacío salvo README y `.gitignore`. Había que dejar un monorepo que
instale, compile y corra en Windows, macOS y Linux, con los contratos del dominio,
el esqueleto de la PWA y la capa de agentes, sin features de producto. La spec no
cubre algunos detalles de herramientas (versiones, alcance de paquetes, cómo se
resuelven imports entre paquetes); esas decisiones están abajo.

## Decisión

1. **pnpm workspaces + Turborepo**, un solo `pnpm-workspace.yaml`. `pnpm` fijado a
   `10.18.2` con `packageManager`. `onlyBuiltDependencies: [esbuild, @tailwindcss/oxide]`
   porque pnpm 10 no corre lifecycle scripts por defecto (Vite no arranca sin eso).
2. **Alcance `@hackods/*`** (no `@olla/*`): es el que ya usan los `AGENTS.md` de la
   capa de agentes copiada. Cambiarlo después toca imports y docs.
3. **Paquetes:** `contracts` (tipos+zod), `domain` (puro, firmas con TODO),
   `nutrition` (contrato de `docs/contracts/nutricion.md`, sin cifras), `ui`
   (presentacional), `sync` (`SyncPort` + outbox en memoria), `printing` (folio y
   plantilla HTML). **No hay `apps/api`** (spec §2.2).
4. **Tipos inferidos de Zod en `contracts`**; `SCHEMA_VERSION = 1` y
   `TABLA_VERSION = 'v0-borrador'` como constantes. No se escriben dos veces.
5. **TypeScript 5.9.3, no la última (7.x):** las herramientas del ecosistema que
   usa el equipo todavía asumen 5.x. Cambiarlo es un PR de infra.
6. **Vite 8 + React 19 + Tailwind 4** con `@tailwindcss/vite` y tokens CSS en
   `packages/ui/src/tokens.css`. Router: React Router 7 en modo datos.
7. **PWA sin `vite-plugin-pwa` todavía:** `public/manifest.webmanifest` + `public/sw.js`
   mínimo + íconos PNG placeholder. La estrategia con Workbox es M0/M6.
   Motivo: menos superficie de versiones para el día 1; el requisito era "manifest
   básico e íconos", no precache perfecto.
8. **Imports entre paquetes:** `paths` de TS apuntan a `src` para `typecheck`; el
   `build` de cada paquete usa `tsconfig.build.json` sin `paths` y resuelve `dist`
   de sus dependencias (Turbo/pnpm ordenan topológicamente). Así
   `pnpm -r typecheck` funciona en un clon limpio y `build` no mete código ajeno.
9. **Tests:** Vitest. Paquetes sin tests usan `--passWithNoTests` para que
   `pnpm -r test` pase con 0. Hay tests reales en `contracts`, `nutrition` y
   `printing` (validación, reglas incompletas, folio).
10. **`lint` es hoy un placeholder** (`turbo run lint` no ejecuta tareas): no hay
    ESLint configurado y agregarlo no era parte del esqueleto. CI corre
    typecheck/test/build. Queda como pendiente explícito.
11. **Supabase:** `config.toml` mínimo; `migrations/20261123120000_init.sql` vacía y
    comentada; `seed.sql` con datos ficticios **comentados** hasta que exista el
    esquema (el PR de contratos v1). `db:seed` es un wrapper Node porque
    `psql "$VAR"` no funciona en cmd/PowerShell.
12. **`.github`:** CI (install frozen, typecheck, test, build), plantilla de PR con
    `## Prueba`, issue form, `CODEOWNERS` con un solo owner y `labels.yml`
    declarativo. **No se crearon issues ni labels**: eso se hace después, a mano.

## Alternativas descartadas

- **`tsup`/bundlers por paquete:** suma una herramienta y una config por paquete;
  `tsc` alcanza para librerías internas.
- **Alias de Vite con prefijo:** rompería `@hackods/ui/tokens.css`; se usan regex
  exactas para los imports de código y el subpath resuelve por `exports`.
- **Generar íconos con una dependencia:** se generaron PNG reales una vez; no se
  commitea un generador que nadie va a correr.

## Consecuencias

- Agregar un paquete nuevo = `package.json`, dos `tsconfig`, entrada en `paths`
  (si lo consumen) y script `build/typecheck/test`.
- Un cambio incompatible en `contracts` obliga a v2, no a editar in-place.
- Pendiente para M0: ESLint, Workbox/PWA completa, `supabase start` con Docker,
  labels y protección de `main`.
