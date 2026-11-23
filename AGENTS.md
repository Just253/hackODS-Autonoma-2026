# AGENTS.md — hackODS-Autonoma-2026

PWA **offline-first** para ollas comunes del Perú. Hackathon U. Autónoma (ODS 2, 5, 11, 12).
Monorepo pnpm. **3 personas, 3 orquestadores, un repo.** Este archivo es de lectura obligatoria
para todo agente antes de tocar nada.

> ⏱ **MODO 6 HORAS VIGENTE.** Mientras dure la ventana del hackathon manda `docs/MODO-6H.md` sobre
> §6 y §8.2 de este archivo: push directo a `main` en la carpeta propia, sin claims ni PRs. Las reglas
> duras (§5) **no** se relajan.

---

## 1. Orden de lectura antes de trabajar

0. `docs/MODO-6H.md` — si el reloj está en la ventana del hackathon, este archivo manda sobre §6 y §8.2.
1. Este archivo (reglas y mapa).
2. `docs/DECISIONES.md` — decisiones que mandan (D1–D9). Si choca con otro doc, gana este.
3. `docs/PROTOCOL.md` — claims, labels, ramas, gate. Único dueño de esa materia.
4. `docs/adr/` — decisiones vigentes de implementación. Si no hay ADR, la decisión no existe.
5. El `AGENTS.md` del paquete que vas a tocar.
6. La skill del dominio si la tarea lo pide (`/skills` o el `description` de cada una).

**Antes de citar algo, buscá su ID.** Toda decisión, problema o spike tiene un identificador en
`docs/ids/REGISTRO.md`: `DEC-…` decide, `PRB-…` analiza, `SPK-…` investiga, `#N` es trabajo. Un ID que
no está en el registro no existe; `pnpm ids:chequear` lo verifica en CI.

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
| Backend | Supabase (Postgres + RLS + Edge Functions `sync-push`/`sync-pull`) | `supabase/` |
| Dominio | TypeScript puro + Zod, sin React ni Supabase | `packages/contracts`, `packages/domain` |
| Nutrición | menú firmado + porción por grupo, **sin cifras** | `packages/nutrition` |
| UI | Tailwind 4 + tokens CSS en `packages/ui` | `packages/ui` |
| Tests | Vitest + Testing Library + MSW + Playwright | por paquete |
| Android (opcional) | Capacitor, solo si un ADR lo justifica | `apps/mobile` |
| Memoria de agente | skills del repo + `docs/` | `.opencode/skills` |

Prohibido agregar una dependencia de runtime sin: (a) justificarla en el issue, (b) que quede en el
PR con su `pnpm-lock.yaml`, (c) avisar en el issue `coordination`.

---

## 3. Mapa del repo

```text
apps/web/            PWA. Pantallas, service worker, acceso a IndexedDB. area:web.
supabase/            Migraciones, RLS, seed, tests y Edge Functions de sync. area:api.
packages/contracts/  Tipos + esquemas Zod del dominio (compartido). area:contracts.
packages/domain/     Reglas puras: presupuesto, serie de precios, conciliación, captura. area:contracts.
packages/nutrition/  Menú firmado, porción por grupo y validación (sin cifras). area:contracts.
packages/sync/       Outbox, ids, versiones, conflictos. area:contracts.
packages/ui/         Componentes y tokens. area:web.
packages/printing/   Folio y plantilla imprimible. area:web.
docs/                DECISIONES.md, PROTOCOL.md, adr/, contracts/, ids/, problemas/, historical/. area:infra.
scripts/             preflight, labels, seed. area:infra.
qa/evidencia/        Salidas de verificación (se commitea poco; ver §7).
```

Jerarquía documental: `docs/DECISIONES.md` decide · `docs/contracts/` especifica ·
`docs/adr/` explica una implementación · este archivo y los `AGENTS.md` de paquete dan reglas
operativas y punteros · `docs/historical/` no se usa para decidir. El mapa tema → archivo canónico
está en `docs/FUENTES.md`.

Una carpeta tiene **un solo dueño** (`docs/PROTOCOL.md` §5). El dueño no es el único que escribe:
es el único que aprueba y el que decide ante conflicto.

---

## 4. Comandos

```bash
pnpm install                     # una vez por máquina; avisá en coordination si cambia el lockfile
pnpm arranque                    # ¿esta máquina puede delegar? GO/NO-GO con el comando de arreglo
pnpm dev                         # web en http://localhost:5173
pnpm build                       # build de todos los paquetes + app
pnpm test                        # Vitest, todos los paquetes (turbo run test)
pnpm typecheck                   # TypeScript en todos los paquetes
pnpm verificar                   # la puerta completa (lo mismo que CI); --rapido saltea el build
                                 # si el diff no trae código (sólo docs), typecheck/tests/build se
                                 # omiten solos: el check `ci` corre igual y reporta verde
pnpm docs:chequear               # ¿el diff trae la doc que le corresponde? (PROCESO-DOCS.md §2)
pnpm hooks:install               # una vez por máquina: activa .githooks (pre-commit y pre-push)
pnpm --filter @hackods/nutrition test   # un paquete concreto
pnpm db:start                    # Postgres + API local (Docker o Podman)
pnpm db:reset                    # migraciones + seed local. SOLO local
pnpm db:test                     # suite pgTAP; copia el seed junto a los tests y lo borra al final
pnpm db:seed                     # seed contra SUPABASE_DB_URL (requiere psql)
pnpm db:types                    # tipos desde la base local
pnpm exec supabase db diff -f <slug>    # nueva migración
```

`pnpm lint` todavía no corre: ningún paquete tiene script `lint` (issue #7, ESLint pendiente).
No hay `test:e2e` en el repo: Playwright aún no está instalado.

Windows: los scripts de coordinación corren con
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight.ps1 ...`.
Linux/macOS/Git Bash: `bash scripts/preflight.sh ...`.

Nunca `npm install`, `yarn`, `bun install` ni `pnpm add` en un paquete que no es el tuyo.

**Worktrees de agentes:** van en `.worktrees/<slug>` **dentro** del repo, no al lado. Los chequeos
(`verificar`, `chequear-ids`) omiten `.worktrees` justamente para no escanear una copia del repo como
si fuera fuente. Ojo: `.git/info/exclude` es local y no viene versionado, así que cada clon agrega la
línea una vez (`pnpm hooks:install` lo hace) o `git status` va a mostrar el worktree como sin trackear.

---

## 5. Reglas duras (el PR se rechaza aunque el código esté bien)

1. **Datos reales, jamás.** Ni nombres, ni DNI, ni direcciones, ni fotos de personas reales en
   fixtures, seeds, capturas, issues o commits. Solo datos sintéticos (`docs/dominio/datos.md`).
2. **Secretos, jamás.** `.env`, `service_role`, keystores, `google-services.json` no se leen, no se
   imprimen, no se commitean. Al cliente solo va la `anon key`.
3. **`main` no se toca a mano.** Todo entra por PR squash. Durante el bootstrap de una sola
   cuenta, el admin puede mergear o pushear sin aprobación (estado real en §8); eso no es licencia
   permanente.
4. **No se instala nada sin avisar** en el issue + `coordination` (dependencia, versión de Node,
   tool del sistema).
5. **No se edita fuera del write-set del claim.** Si necesitás un archivo ajeno, comentá y esperá.
6. **No se mergea sin gate** (§8). Ni `--admin`, ni "son dos líneas", ni "es urgente".
7. **No se reescribe la rama de otro.** Ni force, ni rebase, ni "limpieza".
8. **No se inventan datos de nutrición, precios ni cifras del dominio.** Sin fuente, es
   `sin dato`, no un promedio.
9. **No se declara un bug sin reproducción** ni se cierra sin prueba rojo→verde.
10. **El chat es rumor.** Si no está en GitHub, no pasó.
11. **Nada se pushea sin `pnpm verificar` en verde.** Es la misma puerta que CI: entorno, ids, tipos,
    tests, build, términos muertos, links y secretos. Verde local = verde remoto.
12. **Cada cambio trae su doc en el mismo PR.** Contrato primero, interior junto
    (`docs/PROCESO-DOCS.md`). `pnpm docs:chequear` lo verifica sobre el diff; el hook de pre-commit
    ataja ids, términos retirados y secretos. Una sola vez por máquina: `pnpm hooks:install`.

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
8. Ramas: `feat|fix|chore/<area>-<issue#>-<slug>`, vida < 48 h, **merge de `main` en la rama**
   (nunca rebase ni force-push: hay tres máquinas y un force rompe el clon de otro), squash al
   mergear.

Labels canónicos (`docs/PROTOCOL.md` §3.7 + `.github/labels.yml`): `status:*` (`triage`, `ready`,
`claimed`, `in-review`, `blocked`), `area:*` (`web`, `api`, `infra`, `contracts`), `type:bug`,
`type:feat`, `type:chore`, `type:docs`, `type:spike`, `p0/p1/p2`, `needs:human`, `needs:decision`.
No existen `status:review` ni `status:done`. **Un solo `status:*` por issue.**

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

### 8.1 Estado real de la protección de `main`

Hoy hay **tres cuentas** con `write`: `@Just253` (admin), `@ImBoolean-2` y `@Hansnahu` (push, sin
admin). `CODEOWNERS` sigue por persona, así que:

| Regla | Valor real |
|---|---|
| `enforce_admins` | `false` — el admin puede mergear/pushear sin aprobación (bootstrap) |
| `require_code_owner_reviews` | `false` — `CODEOWNERS` apunta todo a `@Just253`: prenderlo dejaría sin salida todo PR que él no apruebe |
| Aprobaciones requeridas | 1, y el admin puede saltearla con `enforce_admins: false`. Las otras dos cuentas, no |
| Checks requeridos | `ci` (el job se llama `ci`; si se renombra, ningún PR puede mergear) |
| Force push / borrar rama | prohibido |

**El camino normal es rama + PR**, para las tres cuentas. El admin conserva el bypass que da
`enforce_admins: false` y lo usa sólo para dos cosas: el bootstrap del repo y destrabar `main` en rojo.
Force push y borrado de rama están prohibidos para todos.

**Condición para activar `enforce_admins` y `require_code_owner_reviews`:** `CODEOWNERS` por equipo
(hoy apunta a una sola persona). Las 3 cuentas con `write` ya están.
Recién entonces se prenden, en el PR que documente
el cambio. Activarlos antes bloquea todos los PRs.

### 8.2 Checklist del PR

Un PR está listo cuando **todo** esto está en `## Prueba` (plantilla en `docs/PROTOCOL.md` Anexo B):

1. Reproducción antes del cambio (comando + salida).
2. Test que **falla antes y pasa después** (nombre + salida roja + salida verde).
3. `gh pr checks <n> --required` verde en el último commit.
4. Solo archivos del write-set declarado.
5. Criterios de aceptación del issue, uno por uno, con evidencia.
6. Sin secretos: `git diff origin/main...HEAD | rg -i '(api[_-]?key|secret|token|passw|BEGIN .*PRIVATE)'`
   sin resultados.
7. Rama al día con `origin/main` con `git merge origin/main` (no rebase, no force-push). Los merge
   commits de la rama desaparecen al hacer squash.
8. Aprobación de otra cuenta con `review/v1 ... sha:<sha> verdict:approve`. Mientras exista una
   sola cuenta (§8.1), se registra la ausencia de revisor en el PR y no se finge una firma.
9. `pnpm ids:chequear` verde: toda cita `DEC-`/`PRB-`/`SPK-` existe en `docs/ids/REGISTRO.md` y todo
   archivo de problema tiene su fila.

Si falta un ítem, no se pide review. El revisor **checkoutea y corre**; no lee el resumen.

---

## 9. Dónde vive el conocimiento

| Pregunta | Archivo |
|---|---|
| ¿Qué es una olla común, qué actores hay, qué reglas de negocio? | `.opencode/skills/ollas-dominio/` + `docs/dominio/` |
| ¿Qué valida el menú firmado y qué no se inventa? | `.opencode/skills/nutricion-reglas/` + `docs/DECISIONES.md` D3 |
| ¿Cómo funciona el offline, el outbox y los conflictos? | `.opencode/skills/pwa-offline/` |
| ¿Cómo se escribe una política RLS o una migración? | `.opencode/skills/supabase-rls/` |
| ¿PDF, térmica, OCR? | `.opencode/skills/impresion-escaneo/` |
| ¿Empaquetado Android? | `.opencode/skills/capacitor-android/` |
| ¿Cómo se arman fixtures y tests? | `.opencode/skills/testing-fixtures/` |
| ¿Cómo delego y qué le exijo al subagente? | `docs/plantilla-delegacion.md` (6 campos) + `docs/delegacion.md` §7–§9 (resumen de 12 líneas, anti-reinvención, `pnpm verificar`) |
| ¿Cómo cito una decisión, abro un problema o un spike? | `docs/ids/REGISTRO.md` + `.opencode/commands/problema.md` |
| ¿Qué doc va con este cambio y en qué orden? | `docs/PROCESO-DOCS.md` (`pnpm docs:chequear`, `pnpm hooks:install`) |

**Fuente de verdad:** el repo (`main` mergeado) para el código y las decisiones; los issues y PRs
para el trabajo; el chat para nada.
