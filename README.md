# hackODS-Autonoma-2026

PWA **offline-first** para **ollas comunes**: padrón de personas, despensa, recetas y servicios,
evaluación nutricional explicable, solicitudes de insumos entre ollas, impresión y escaneo.
Pensada para equipos de gama baja y organizadoras con baja alfabetización digital.

Hackathon ODS — Universidad Autónoma del Perú.

## Estado

Esqueleto M0: el monorepo instala, compila y arranca. **No hay features de producto todavía.**
La pantalla de `/` es una prueba de humo (router + Tailwind + tokens + paquetes).

## Requisitos

- Node 22 (`.nvmrc`)
- pnpm 10.18.2 (`packageManager` en `package.json`)

## Comandos

```bash
pnpm install          # instala todo el workspace
pnpm dev              # PWA en http://localhost:5173
pnpm build            # build de todos los paquetes + app
pnpm test             # Vitest
pnpm typecheck        # TypeScript en todos los paquetes
pnpm lint             # placeholder: aún no hay ESLint configurado
pnpm db:reset         # Supabase local: migraciones + seed (requiere Docker)
pnpm db:seed          # seed contra SUPABASE_DB_URL (requiere psql)
pnpm db:types         # genera tipos desde la base local
```

## Estructura

```text
apps/web/            PWA Vite + React 19 + TypeScript + Tailwind 4
packages/contracts/  tipos + zod del dominio (contrato compartido)
packages/domain/     reglas puras (firmas con TODO)
packages/nutrition/  contrato del motor nutricional, sin cifras
packages/ui/         componentes y tokens
packages/sync/       SyncPort + outbox (stub)
packages/printing/   folio y plantilla imprimible (sin PDF aún)
supabase/            config, migraciones, seed ficticio
scripts/             preflight, labels, seed
.github/             CI, plantillas, CODEOWNERS, labels
```

## Documentación

- `AGENTS.md` — reglas para todo agente/persona antes de tocar nada.
- `docs/PROTOCOL.md` — coordinación: claims, ramas, PRs, verificación.
- `docs/VERIFICACION.md` — búsqueda anti-duplicados antes de abrir un issue.
- `docs/PLAN.md` — milestones y backlog.
- `docs/ARQUITECTURA.md` — decisiones técnicas de la spec.
- `docs/AGENTES.md` — roster de agentes, permisos y comandos.
- `docs/contracts/nutricion.md` — contrato del motor nutricional.
- `docs/research/01-prd.md` — PRD.
- `docs/adr/` — decisiones, una por archivo.
- `docs/dia-1.md` — orden del día 1.

## Reglas

- Sin datos personales reales en el repo: los seeds son ficticios y evidentes.
- Sin secretos en el repo; al cliente solo va la `anon key`.
- Nada se dice resuelto sin prueba que falle antes y pase después.
- No se inventan valores nutricionales ni reglas clínicas: `[valor a confirmar]`.
