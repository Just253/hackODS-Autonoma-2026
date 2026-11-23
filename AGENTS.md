# AGENTS.md — hackODS-Autonoma-2026

PWA **offline-first** para ollas comunes del Perú. Hackathon U. Autónoma (ODS 2, 5, 11, 12).
Monorepo pnpm. **3 personas, 3 orquestadores, un repo.** Este archivo es de lectura obligatoria
para todo agente antes de tocar nada.

---

## 1. Orden de lectura antes de trabajar

1. Este archivo (reglas y mapa).
2. `docs/PROTOCOL.md` — claims, labels, ramas, gate. Copiado de `_orquestacion-research/02`.
3. `docs/adr/` — decisiones vigentes. Si no hay ADR, la decisión no existe.
4. El `AGENTS.md` del paquete que vas a tocar.
5. La skill del dominio si la tarea lo pide (`/skills` o el `description` de cada una).

Si algo de este archivo contradice a `docs/PROTOCOL.md`, gana `PROTOCOL.md` y se corrige acá en el
mismo PR.

---

## 2. Stack

**Estado: vigente según `docs/adr/0001-base-monorepo.md` (esqueleto M0).** Si un ADR
nuevo cambia algo, este archivo y los comandos de abajo se actualizan en el mismo PR.

| Capa | Propuesta | Dónde |
|---|---|---|
| Runtime | Node 22 LTS, pnpm 10.18.2 (workspaces + Turborepo) | raíz |
| Web | Vite + React 19 + TypeScript + Tailwind 4, PWA básica (manifest + SW) | `apps/web` |
| Estado/red | React Router 7 en modo datos + cliente Supabase JS (solo en sync) | `apps/web` |
| Persistencia local | IndexedDB (Dexie), patrón **outbox** | `packages/sync`, `apps/web` |
| Backend | Supabase (Postgres + RLS + Edge Functions) | `supabase/` |
| Dominio | TypeScript puro + Zod, sin React ni Supabase | `packages/domain` |
| Nutrición | contrato de interfaces + proveedores inyectados, **sin cifras** | `packages/nutrition` |
| UI | Tailwind 4 + tokens CSS en `packages/ui` | `packages/ui` |
| Tests | Vitest + Testing Library + MSW + Playwright | por paquete |
| Android (opcional) | Capacitor, solo si un ADR lo justifica | `apps/mobile` |
| Memoria de agente | skills del repo + `docs/` | `.opencode/skills` |

Prohibido agregar una dependencia de runtime sin: (a) justificarla en el issue, (b) que quede en el
PR con su `pnpm-lock.yaml`, (c) avisar en el issue `coordination`.

---

## 3. Mapa del repo

```text
apps/web/            PWA. Pantallas, service worker, acceso a IndexedDB.
supabase/            Migraciones, RLS, seed, edge functions. Dueño: area:api.
packages/domain/     Tipos, esquemas Zod, reglas de negocio puras. area:contracts.
packages/nutrition/  Contrato del motor nutricional y proveedores (sin cifras). area:contracts.
packages/sync/       Outbox, ids, versiones, conflictos. area:contracts.
packages/ui/         Componentes y tokens. area:web.
docs/                PROTOCOL.md, adr/, dominio/, guias/. area:infra.
scripts/             preflight, claim, labels. area:infra.
qa/evidencia/        Salidas de verificación (se commitea poco; ver §7).
```

Una carpeta tiene **un solo dueño** (`docs/PROTOCOL.md` §5). El dueño no es el único que escribe:
es el único que aprueba y el que decide ante conflicto.

---

## 4. Comandos

```bash
pnpm install                     # una vez por máquina; avisá en coordination si cambia el lockfile
pnpm dev                         # web en http://localhost:5173
pnpm build                       # build de producción de todos los paquetes
pnpm test                        # Vitest, todos los paquetes
pnpm test --filter @hackods/nutrition
pnpm test:e2e                    # Playwright (requiere build previo)
pnpm lint && pnpm typecheck
pnpm exec supabase start         # Postgres + API local (Docker)
pnpm exec supabase db reset      # migraciones + seed local. SOLO local
pnpm exec supabase db diff -f <slug>   # nueva migración
```

Windows: los scripts de coordinación corren con
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight.ps1 ...`.
Linux/macOS/Git Bash: `bash scripts/preflight.sh ...`.

Nunca `npm install`, `yarn`, `bun install` ni `pnpm add` en un paquete que no es el tuyo.

---

## 5. Reglas duras (el PR se rechaza aunque el código esté bien)

1. **Datos reales, jamás.** Ni nombres, ni DNI, ni direcciones, ni fotos de personas reales en
   fixtures, seeds, capturas, issues o commits. Solo datos sintéticos (`docs/dominio/datos.md`).
2. **Secretos, jamás.** `.env`, `service_role`, keystores, `google-services.json` no se leen, no se
   imprimen, no se commitean. Al cliente solo va la `anon key`.
3. **`main` no se toca a mano.** Sin push directo, sin force, sin merge sin aprobación de otra
   cuenta. Todo entra por PR squash.
4. **No se instala nada sin avisar** en el issue + `coordination` (dependencia, versión de Node,
   tool del sistema).
5. **No se edita fuera del write-set del claim.** Si necesitás un archivo ajeno, comentá y esperá.
6. **No se mergea sin gate** (§8). Ni `--admin`, ni "son dos líneas", ni "es urgente".
7. **No se reescribe la rama de otro.** Ni force, ni rebase, ni "limpieza".
8. **No se inventan datos de nutrición, precios ni cifras del dominio.** Sin fuente, es
   `sin dato`, no un promedio.
9. **No se declara un bug sin reproducción** ni se cierra sin prueba rojo→verde.
10. **El chat es rumor.** Si no está en GitHub, no pasó.

---

## 6. Protocolo de claims, en 8 líneas

Resumen operativo; la gramática completa está en `docs/PROTOCOL.md` §3 y §6.

1. Antes de crear o reclamar: `/preflight` (busca issues abiertos y cerrados, PRs, ramas, commits,
   claims). Veredicto: `NUEVO | REAL-ABIERTO | EN-CURSO | YA-RESUELTO`.
2. Solo se reclama un issue con `status:ready` (criterio de aceptación + prueba esperada escritos).
3. Claim = **una línea** en el issue + `status:claimed` + assignee + rama + worktree:
   `claim/v1 issue:12 by:@ana agent:ana-lead-3f2a area:web branch:feat/web-12-x started:... ttl:24h searched:... files:apps/web/** fp:fp_web_x`.
4. `gh issue develop 12 --base main --name <rama> --worktree ../wt/12-x --checkout`. Un worktree =
   una rama = un agente. Dos agentes en el mismo checkout es el bug más caro.
5. Draft PR en el primer push (aunque sea un commit vacío). Un issue = un PR.
6. Claim sin push ni heartbeat en 24 h = huérfano: se reclama con `reclaim/v1` y aviso de 12 h.
7. Al cerrar: `release/v1 ... reason:done pr:<n>` y limpiar worktree.
8. Ramas: `feat|fix|chore/<area>-<issue#>-<slug>`, vida < 48 h, rebase sobre `main`, squash al
   mergear.

Labels canónicos: `status:*` (`triage`, `ready`, `claimed`, `in-review`, `blocked`), `area:*`
(`web`, `api`, `infra`, `contracts`), `type:*`, `p0/p1/p2`, `needs:human`, `needs:decision`.
**Un solo `status:*` por issue.**

---

## 7. Agentes y reparto de las 3 personas

Cada persona corre **su propio orquestador** (una sesión lead de OpenChamber Desktop). Los
subagentes son de la persona que los lanza; no se comparten sesiones entre máquinas.

| Persona | Área | Dueño de | Agentes que usa | Revisa PRs de |
|---|---|---|---|---|
| **A — PWA/UI** | `web` | `apps/web`, `packages/ui` | `orquestador`, `frontend` | `api`, `contracts` |
| **B — datos/backend** | `api` | `supabase/` | `orquestador`, `backend`, `datos-supabase`, `seguridad-privacidad` | `web`, `contracts` |
| **C — dominio/nutrición/docs** | `contracts` + `infra` | `packages/domain`, `packages/nutrition`, `packages/sync`, `docs/`, `scripts/` | `orquestador`, `nutricion`, `docs`, `qa-verificador` | `web`, `api` |

Reglas del reparto:

- **`contracts` (domain, nutrition, sync) se mergea primero y aparte**, con 2 aprobaciones (una de
  A, una de B). Consumidores trabajan contra el contrato ya mergeado o contra un stub.
- **`qa-verificador` lo puede lanzar cualquiera**, pero el veredicto que habilita un merge lo emite
  **otra persona** (nunca el autor ni un subagente del autor).
- Si C se satura, `qa-verificador` pasa a quien esté libre; `infra` rota por semana.
- Un agente por sesión. El orquestador **no escribe código**: planifica, delega, integra y abre PRs.

Detalle de permisos, modelos y prompts: `.opencode/agents/*.md` y `docs/AGENTES.md` §3.

---

## 8. Gate: qué significa "resuelto"

Un PR está listo cuando **todo** esto está en `## Prueba` (plantilla en `docs/PROTOCOL.md` Anexo B):

1. Reproducción antes del cambio (comando + salida).
2. Test que **falla antes y pasa después** (nombre + salida roja + salida verde).
3. `gh pr checks <n> --required` verde en el último commit.
4. Solo archivos del write-set declarado.
5. Criterios de aceptación del issue, uno por uno, con evidencia.
6. Sin secretos: `git diff origin/main...HEAD | rg -i '(api[_-]?key|secret|token|passw|BEGIN .*PRIVATE)'`
   sin resultados.
7. Rebase sobre `origin/main`, sin merge commits.
8. Aprobación de otra cuenta con `review/v1 ... sha:<sha> verdict:approve`.

Si falta un ítem, no se pide review. El revisor **checkoutea y corre**; no lee el resumen.

---

## 9. Dónde vive el conocimiento

| Pregunta | Archivo |
|---|---|
| ¿Qué es una olla común, qué actores hay, qué reglas de negocio? | `.opencode/skills/ollas-dominio/` + `docs/dominio/` |
| ¿Cómo se calcula una ración y qué no se inventa? | `.opencode/skills/nutricion-reglas/` |
| ¿Cómo funciona el offline, el outbox y los conflictos? | `.opencode/skills/pwa-offline/` |
| ¿Cómo se escribe una política RLS o una migración? | `.opencode/skills/supabase-rls/` |
| ¿PDF, térmica, OCR? | `.opencode/skills/impresion-escaneo/` |
| ¿Empaquetado Android? | `.opencode/skills/capacitor-android/` |
| ¿Cómo se arman fixtures y tests? | `.opencode/skills/testing-fixtures/` |
| ¿Cómo delego y qué le exijo al subagente? | `docs/plantilla-delegacion.md`, `docs/delegacion.md` |

**Fuente de verdad:** el repo (`main` mergeado) para el código y las decisiones; los issues y PRs
para el trabajo; el chat para nada.
