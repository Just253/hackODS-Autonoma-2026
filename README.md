# hackODS-Autonoma-2026

PWA **offline-first** para **ollas comunes y comedores PCA**: padrón por código, despensa,
menú semanal firmado por nutricionista, porción por grupo, solicitudes de insumos entre ollas,
impresión y escaneo. Pensada para equipos de gama baja y organizadoras con baja alfabetización digital.

Hackathon ODS — Universidad Autónoma del Perú.

> **Vigente: `docs/DECISIONES.md`.** Ese archivo manda sobre el PRD, la arquitectura, el contrato
> nutricional y el plan; los demás quedan como insumo e historia.

## Estado

Esqueleto M0 con las decisiones D1–D7 aplicadas: el monorepo instala, compila y arranca.
**No hay features de producto todavía.** La pantalla de `/` es una prueba de humo
(router + Tailwind + tokens + paquetes).

Alcance de la demo: **3 minutos** (+ anexo de 2). El **75 °C** es checklist de inocuidad del
servicio, no un cálculo.

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
apps/web/              PWA Vite + React 19 + TypeScript + Tailwind 4
packages/contracts/    tipos + zod del dominio (contrato compartido)
packages/domain/       reglas puras (firmas con TODO)
packages/nutrition/    motor de menú firmado + porción por grupo (sin cifras)
packages/ui/           componentes y tokens
packages/sync/         SyncPort + outbox (orden lamport, lote ≤ 100)
packages/printing/     folio y plantilla imprimible (sin PDF aún)
supabase/              config, migraciones, seed ficticio, tests
supabase/functions/    Edge Functions: sync-push y sync-pull (Deno)
scripts/               preflight, labels, seed
.github/               CI, plantillas, CODEOWNERS, labels
```

## Identidad y privacidad

- El servidor **solo** conoce `Persona.codigoP` (`P-XXXX`). El esquema SQL no tiene identidad
  personal, documento, teléfono ni dirección.
- `nombreLocal`/`alias` viven **solo en el dispositivo** (`IdentidadLocal`, `localOnly: true`) y
  nunca se serializan ni se envían a `/sync/push`.
- Los impresos usan la etiqueta local si existe; si no, imprimen `P-XXXX`.
- Seeds ficticios y marcados. Cero datos de los PDF fuente.

## Documentación

- `docs/DECISIONES.md` — **decisiones que mandan** (D1–D7), fuente: PDFs + respuestas del usuario.
- `AGENTS.md` — reglas para todo agente/persona antes de tocar nada.
- `docs/PROTOCOL.md` — coordinación: claims, ramas, PRs, verificación.
- `docs/VERIFICACION.md` — búsqueda anti-duplicados antes de abrir un issue.
- `docs/PLAN.md` — milestones y backlog (insumo; manda `DECISIONES.md`).
- `docs/ARQUITECTURA.md` — decisiones técnicas (insumo; manda `DECISIONES.md`).
- `docs/AGENTES.md` — roster de agentes, permisos y comandos.
- `docs/contracts/sync.md` — `POST /sync/push` y `GET /sync/pull`.
- `docs/contracts/nutricion.md` — contrato histórico del motor nutricional.
- `docs/research/01-prd.md` — PRD.
- `docs/adr/` — decisiones de implementación, una por archivo.
- `docs/dia-1.md` — orden del día 1.

## Reglas

- Sin datos personales reales en el repo: los seeds son ficticios y evidentes.
- Sin secretos en el repo; al cliente solo va la `anon key`.
- Nada se dice resuelto sin prueba que falle antes y pase después.
- No se inventan valores nutricionales ni reglas clínicas: `[valor a confirmar]`.
