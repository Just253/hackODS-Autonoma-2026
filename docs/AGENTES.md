# agent-base — la base de agentes de `hackODS-Autonoma-2026`

Esta carpeta es un **esqueleto listo para copiar** a la raíz del repo. No es documentación del
producto: es la capa operativa (quién hace qué, con qué permisos, con qué prueba).

Todo el frontmatter es sintaxis **OpenCode V2** verificada: `mode`, `model`, `permissions`
(`action` / `resource` / `effect`), `steps` en agentes; `description` / `agent` / `subagent` en
comandos; `name` / `description` en skills. No hay campos V1 (`tools`, `permission`, `maxSteps`,
`temperature`).

---

## 1. Cómo se usa

Esta carpeta ya está copiada en la raíz del repo: `AGENTS.md`, `opencode.json`,
`.opencode/` y los `AGENTS.md` de cada paquete son parte del proyecto. El origen
fue `_hackods-plan/agent-base/` y no hace falta volver a copiarlo.

Después:

1. Abrí el repo en OpenChamber Desktop y verificá que aparezcan 8 agentes y 6 comandos
   (`/preflight`, `/claim`, `/verify`, `/seed`, `/demo`, `/release`).
2. Corré `/preflight "prueba de humo"`. Si responde con un veredicto y no crea nada, la base está viva.
3. Ajustá `model:` de cada agente al proveedor que tenga cada persona. El formato es
   `provider/model` o `provider/model#variant`. Los valores de acá son sugerencias, no una decisión.

---

## 2. Mapa de archivos

```text
AGENTS.md                          reglas del repo (lo lee todo agente, siempre)
README.md                          este mapa
opencode.json                      default_agent + denegaciones globales de secretos

apps/web/AGENTS.md                 PWA React/Vite, offline, service worker
supabase/AGENTS.md                 migraciones, RLS, seed, edge functions
packages/domain/AGENTS.md          tipos y reglas de negocio (contratos)
packages/nutrition/AGENTS.md       contrato del motor nutricional (sin cifras)
packages/ui/AGENTS.md              componentes y tokens
packages/sync/AGENTS.md            outbox, resolución de conflictos (contratos)
docs/AGENTS.md                     PROTOCOL.md, ADRs, dominio, guías

.opencode/agents/
  orquestador.md                   planifica y delega. NO escribe código
  frontend.md                      apps/web + packages/ui
  backend.md                       supabase/functions + integraciones
  datos-supabase.md                migraciones, RLS, seed
  nutricion.md                     packages/nutrition
  qa-verificador.md                read-only: reproduce y verifica
  docs.md                          docs/, ADRs, README
  seguridad-privacidad.md          read-only: audita RLS, PII, secretos

.opencode/commands/
  preflight.md  claim.md  verify.md  seed.md  demo.md  release.md

.opencode/skills/
  ollas-dominio/       glosario, actores, reglas de negocio
  nutricion-reglas/    contrato, veredicto y qué no se inventa
  pwa-offline/         IndexedDB, outbox, conflictos
  supabase-rls/        políticas, migraciones, seed
  impresion-escaneo/   PDF, térmica, OCR
  capacitor-android/   empaquetado Android
  testing-fixtures/    datos de prueba, relojes, red falsa

docs/delegacion.md                 subagente vs sesión hija, write-set, barrera
docs/plantilla-delegacion.md       contrato de 6 campos + 3 ejemplos
docs/dia-1.md                      orden exacto del día 1
```

---

## 3. Quién es quién

| Agente | Modo | Escribe | Delega | Modelo sugerido |
|---|---|---|---|---|
| `orquestador` | primary | solo `docs/planes/**`, `docs/adr/**` | sí (7 agentes) | caro (`#high`) |
| `frontend` | all | `apps/web/**`, `packages/ui/**` | no | medio |
| `backend` | all | `supabase/functions/**` | no | medio |
| `datos-supabase` | all | `supabase/migrations/**`, `supabase/seed/**`, `supabase/tests/**` | no | medio |
| `nutricion` | all | `packages/nutrition/**` | no | caro (`#high`) |
| `docs` | subagent | `docs/**`, `**/README.md` | no | barato |
| `qa-verificador` | subagent | solo `qa/evidencia/**` | no | caro (`#high`) |
| `seguridad-privacidad` | subagent | solo `docs/seguridad/**` | no | caro (`#high`) |

Regla de modelos: **decide → caro, transcribe → barato, escribe código → medio.** El agente que
emite un veredicto que bloquea un merge (`nutricion`, `qa-verificador`, `seguridad-privacidad`,
`orquestador`) nunca corre en el modelo barato.

Reparto de las 3 personas y qué agente usa cada una: `AGENTS.md` §6.

---

## 4. Las tres reglas que más caos evitan

1. **Un issue, un claim, una rama, un worktree, un agente.** Sin claim no hay trabajo; sin push ni
   heartbeat en 24 h el claim es huérfano y se reclama con aviso, no por silencio.
2. **Nadie dice "listo" sin prueba que fallaba antes y pasa después**, pegada en `## Prueba`, y
   aprobada por otra cuenta. El verificador corre el comando; no lee el resumen.
3. **El que escribe no es el que aprueba.** `main` protegida, squash, y el subagente nunca mergea.

---

## 5. Qué NO hay acá (a propósito)

- No hay bus entre orquestadores, ni dashboard, ni bot que apruebe: GitHub ya es el bus
  (`_orquestacion-research/05-sintesis.md` §8).
- No hay `claims.json` en el repo: el claim vive en el issue.
- No hay agentes que "investiguen" sin entregable: el contrato de delegación
  (`docs/plantilla-delegacion.md`) exige resultado, prueba, write-set y formato de retorno.
