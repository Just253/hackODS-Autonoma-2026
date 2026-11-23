# Orquestación: arranque de las 3 personas

Guía operativa para que **tres personas trabajen en paralelo** sobre
`Just253/hackODS-Autonoma-2026` sin pisarse. No reemplaza al protocolo: lo pone en orden de uso.
Si algo de acá contradice `docs/PROTOCOL.md`, gana `PROTOCOL.md` y se corrige en el mismo PR.

> Estado del repo al escribir esto: `main` con monorepo, contratos v1, esquema base, seed, sync y
> workflows mergeados. **No hay issues de feature abiertos antes de esta guía**; los 8 de arranque ya
> están en `status:ready`.

---

## 0. Reparto (una carpeta, un dueño)

| Persona | Área(s) | Dueño de | Agentes que usa | Revisa PRs de |
|---|---|---|---|---|
| **A** | `area:web` | `apps/web/`, `packages/ui/`, `packages/printing/` | `orquestador`, `frontend` | `api`, `contracts` |
| **B** | `area:api` | `supabase/`, `packages/sync/` | `orquestador`, `backend`, `datos-supabase`, `seguridad-privacidad` | `web`, `contracts` |
| **C** | `area:contracts` + `area:nutricion` + `area:infra` + `area:docs` | `packages/contracts/`, `packages/domain/`, `packages/nutrition/`, `docs/`, `scripts/`, `.github/` | `orquestador`, `nutricion`, `docs`, `qa-verificador` | `web`, `api` |

Reglas del reparto que no se negocian:

- **`contracts` y `nutrition` se mergean primero y aparte**, con 2 aprobaciones (una de A, una de B),
  y antes del código que los consume.
- **Nadie aprueba su propio PR.** GitHub no lo permite y el protocolo tampoco.
- El `orquestador` **no escribe código**: planifica, delega, integra y abre PRs.
- Un worktree = una rama = un agente. Dos agentes en el mismo checkout es el bug más caro.

---

## 1. Cada persona necesita su propia cuenta de GitHub

Requisito técnico, no preferencia. Con una sola cuenta:

- nadie puede aprobar el PR de otro (GitHub bloquea auto-aprobación);
- la protección de `main` con 1 aprobación deja los PRs sin salida;
- `CODEOWNERS` no dispara review de nadie.

Hoy existe **una** cuenta (`@Just253`, admin). Mientras no estén las otras dos:

- `main` está protegida con **`enforce_admins: false`**: el admin puede mergear sin aprobación.
  Eso es **bootstrap temporal**, no una licencia. El gate de `docs/PROTOCOL.md` §6 se sigue
  completando en `## Prueba`; lo que falta es la firma de otra persona.
- Primera tarea del día 0: invitar a las otras dos cuentas con permiso **write** al repo y que cada
  una acepte. Recién entonces se abre el primer PR de feature.

Cada agente se identifica con un token de sesión en el claim y en el trailer del commit:
`Agent: a-lead-3f2a`, `b-sub-api-91c0`, `c-sub-nutricion-77c1`.

---

## 2. Arranque técnico (idéntico para las tres)

OpenChamber **Desktop**, no el CLI global: la copia global no tiene `lead.*` ni `ownWork`, así que no
puede crear sesiones lead ni worktrees. **Las tres personas usan la misma versión** (decir cuál en el
`coordination` antes de empezar).

```text
1. Instalar OpenChamber Desktop (misma version en las 3 PCs) y autenticar con TU cuenta de GitHub.
2. Abrir como directorio de trabajo:
   C:\Users\<usuario>\FilesForDev\Github\hackODS-Autonoma-2026
3. Verificar que carguen 8 agentes y 6 comandos (/preflight, /claim, /verify, /seed, /demo, /release).
4. Crear la sesión LEAD de tu área: "A-lead", "B-lead", "C-lead".
   Es la única que abre PRs y cambia labels; los subagentes commitean a su rama y nada mas.
5. Pegar el brief de §3 en la sesion lead.
6. Smoke del entorno:
   /preflight "prueba de humo"     -> devuelve veredicto y NO crea nada
7. Dependencias: pnpm install (una vez por maquina; solo B toca pnpm-lock.yaml)
   Node 22 + pnpm 10.18.2 (fijados en package.json). Windows: PowerShell 5.1.
```

Si el smoke falla, **no se reclama nada**: se avisa en el issue `coordination` y se arregla primero
(cuesta minutos; sin esto se pierden días).

---

## 3. Brief para pegar en la sesión lead

```text
ROL: orquestador lead del area <web|api|contracts> de hackODS-Autonoma-2026.
RESULTADO: integrar y mergear los PRs de mi area; no escribo codigo de feature.
PRUEBA: gh pr checks <n> --required verde + ## Prueba con rojo->verde pegado.
WRITE-SET: mi area segun docs/ORQUESTACION.md §0. Todo lo demas es lectura.
LIMITES: no toco main a mano, no instalo dependencias sin avisar en el issue, no edito fuera del
  write-set del claim, no apruebo mis propios PRs.
RETORNO: por tarea -> numero de issue, numero de PR, comando de prueba y salida; por cierre de dia ->
  lineas doing/next/blocked/risk en el issue coordination.
Lectura obligatoria antes de tocar nada: AGENTS.md, docs/DECISIONES.md, docs/PROTOCOL.md,
  docs/ORQUESTACION.md, el AGENTS.md de mi paquete.
```

---

## 4. Orden de lectura

Común a las tres (60 minutos, no más):

1. `AGENTS.md` — reglas duras y mapa del repo.
2. `docs/DECISIONES.md` — D1–D8. **Manda sobre todo lo demás.**
3. `docs/PROTOCOL.md` §0–§7 — claims, labels, ramas, gate.
4. `docs/adr/0001-base-monorepo.md` y `docs/adr/0002-decisiones-usuario.md`.
5. `AGENTS.md` de tu paquete.

Después, según el área:

| Persona | Además lee | Por qué |
|---|---|---|
| A | `apps/web/AGENTS.md`, `packages/ui/AGENTS.md`, skill `pwa-offline` | offline real, outbox, service worker |
| B | `supabase/AGENTS.md`, skill `supabase-rls`, `docs/contracts/sync.md` | RLS, migraciones, lote ≤ 100 |
| C | `packages/{domain,nutrition,sync}/AGENTS.md`, `docs/contracts/nutricion.md`, skill `nutricion-reglas` | menú firmado, porción por grupo, sin cifras |

`docs/PLAN.md` es **insumo histórico** (habla de `area:domain` y de `calcularRacion`): no se usa para
decidir el alcance actual.

---

## 5. Reparto de los primeros issues

Los 8 issues de arranque están en `status:ready`, con criterio de una línea, prueba exigida y
`blocked_by` en el cuerpo. Se reclaman en este orden.

| Persona | Objetivo | Primer issue | Después |
|---|---|---|---|
| **A** | Que la PWA exista sin red: alta → ración → recarga | **#1** walking skeleton (`fp:web-walking-skeleton`) | #3 PWA instalable + SW real |
| **B** | Que los datos sean confiables y no filtren salud | **#2** seed idempotente (`fp:api-seed-idempotente`) | #4 RLS por rol (`needs-verification`) |
| **C** | Que el contrato de comprobantes exista antes del código | **#5** comprobantes D8 (`fp:contracts-comprobantes`) | #6 ComputePort, luego #7 CI |

Los que no son primer issue: #8 (captura por voz) está `blocked_by #6`; no se reclama hasta que
ComputePort esté mergeado.

Cómo se reclama, sin inventar nada (Windows, desde el repo):

```powershell
gh issue view 1 --comments
gh issue develop 1 --base main --name feat/web-1-walking-skeleton `
  --worktree ../wt/1-walking-skeleton --checkout
```

```text
claim/v1 issue:1 by:@<tu-cuenta> agent:<tu-humano>-lead-<4hex> area:web branch:feat/web-1-walking-skeleton started:2026-11-23T15:00:00Z ttl:24h searched:2026-11-23 files:apps/web/src/**
```

```powershell
gh issue edit 1 --add-label status:claimed --remove-label status:ready --add-assignee "@me"
```

Primer push: **draft PR**, aunque sea un commit vacío. Un issue = un PR.

**Vocabulario de estado vigente** (un solo `status:*` por issue):

```text
status:ready -> status:claimed -> status:review -> status:done
                                  \-> status:blocked (y vuelve a claimed al destrabarse)
```

`status:in-review` y `type:feat` existen por compatibilidad con `docs/PROTOCOL.md` y
`scripts/labels.sh`; si los ves en un doc viejo, el nombre del set corto es `status:review`.

---

## 6. Qué revisa cada una de las otras

Round-robin por área, y el review se hace **corriendo el comando**, no leyendo el resumen:

| Autor | Revisor | Qué mira además del diff |
|---|---|---|
| A (web) | C | que ninguna escritura saltee el outbox; que la pantalla no calcule negocio; PII solo local |
| B (api) | A | RLS con test de rol; migración forward-only; `idempotency_key = event_uuid`; seed sin datos reales |
| C (contracts/domain) | A **y** B | 2 aprobaciones obligatorias; cambio aditivo, no in-place; sin cifras nutricionales |

Gate mínimo para pedir review (`docs/PROTOCOL.md` §6): reproducción, rojo→verde, `gh pr checks <n>
--required` verde, solo archivos del claim, criterios checkeados uno por uno, sin secretos, rebase
sobre `origin/main`. Si falta un ítem, **no se pide review**.

```powershell
gh pr checkout <n>
gh pr checks <n> --required
<el comando que el autor puso en ## Prueba>
```

Veredicto machine-readable en el PR:

```text
review/v1 pr:<n> by:@<cuenta> agent:<humano>-lead-<4hex> verdict:approve sha:<sha7> gate:pass at:<ISO>
```

---

## 7. Definición de hecho (igual para las tres)

Una tarea está hecha cuando **todo** esto es cierto:

- [ ] PR mergeado a `main` por **squash**, con `Closes #<issue>`.
- [ ] `## Prueba` completa: comando, salida roja y salida verde.
- [ ] Criterios de aceptación del issue, uno por uno, con evidencia.
- [ ] `gh pr checks <n> --required` verde en el último commit.
- [ ] Solo archivos del `files:` del claim; sin secretos en el diff.
- [ ] Rama rebasada sobre `origin/main`, sin merge commits.
- [ ] `release/v1 ... reason:done pr:<n>` en el issue y worktree borrado.
- [ ] La línea `doing/next/blocked/risk` del día escrita en `coordination`.

Si el issue pedía una prueba y no existe el comando para correrla, la tarea **no está hecha**: se
escribe el test o se re-acota el issue, no se aprueba "porque el código está bien".

---

## 8. Estado de la protección de `main`

Configurada para que el protocolo no dependa de la buena voluntad de nadie:

| Regla | Valor |
|---|---|
| Push directo | bloqueado (todo por PR) |
| Aprobaciones requeridas | 1, con `dismiss_stale_reviews` |
| Check requerido | `ci` (workflow y job `ci` de `.github/workflows/ci.yml`) |
| Force push | prohibido |
| Borrar la rama | prohibido |
| Historial | lineal (squash) |
| Conversaciones | deben estar resueltas |
| `enforce_admins` | `false` — bootstrap con una sola cuenta (ver §1) |

Cuando estén las 3 cuentas: pasar `enforce_admins` a `true` en el mismo PR que documente el cambio.
`Require review from Code Owners` queda apagado hasta que `CODEOWNERS` apunte a cuentas reales con
write (hoy todo apunta a `@Just253`); activarlo antes bloquearía todos los PRs.

---

## 9. Verificación rápida del día

```powershell
gh issue list --state open --label status:ready  --limit 20
gh issue list --state open --label status:claimed --limit 20
gh pr list   --state open --json number,title,author,isDraft,reviewDecision
gh workflow list
gh api repos/Just253/hackODS-Autonoma-2026/branches/main/protection
```

Si dos personas aparecen con el mismo `files:` en sus claims, se resuelve **antes** de escribir la
primera línea (`docs/PROTOCOL.md` §5.3): gana el claim más viejo y el otro consume o espera con
`status:blocked`.
