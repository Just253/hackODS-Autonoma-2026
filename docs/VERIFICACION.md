# 03 - Verificación y anti-duplicados

Guía ejecutable para que 3 personas, 3 orquestadores y varios subagentes puedan trabajar sobre el
mismo repo remoto sin duplicar trabajo y sin creer reportes sin prueba.

**Regla que ordena todo el documento:**

> Ningún agente declara un bug por su cuenta, y ninguno declara "ya está arreglado".
> Un bug existe si hay evidencia reproducible. Está resuelto si hay una prueba que fallaba antes
> y pasa después, en un commit identificable.

---

## 0. Qué está probado y qué no

Todo lo marcado **PROBADO** se ejecutó en esta máquina (Windows 11, `gh` 2.101.0, git 2.54, PowerShell 5.1)
contra repos reales: `cli/cli` (público, mucho volumen) y `Just253/autonoma-cli` (privado propio, vacío).
Lo marcado **DOCUMENTADO** es sintaxis verificada en `--help` / documentación pero que **escribe** en
GitHub, así que no se ejecutó: la tarea pedía solo lectura.

| Bloque | Estado |
|---|---|
| Entorno (`gh auth`, scopes, repo, git config) | PROBADO |
| Búsqueda de issues abiertos y cerrados por texto | PROBADO |
| Búsqueda exacta por huella (`fp_...` en body) | PROBADO |
| Búsqueda de PRs, ramas remotas, ramas por keyword | PROBADO |
| Commits recientes por archivo/área | PROBADO |
| Estado de CI (rama por defecto y por PR) | PROBADO |
| Parseo de claims `claim/v1` + detección de huérfanos/reclaims | PROBADO (offline con fixtures + ejecución real del pipeline de comentarios) |
| `preflight.ps1` (Windows, sin jq) | PROBADO: self-test 31/31 + 4 corridas reales |
| `preflight.sh` (bash + jq) | PROBADO: `bash -n`, self-test 16/16, 3 corridas reales con jq |
| Crear issue / comentar / asignar / etiquetar (los `claim/v1`) | DOCUMENTADO (escribe; no se ejecutó) |

---

## 1. Entorno: qué hay de verdad en esta máquina

```
gh version 2.101.0 (2026-09-15)
git version 2.54.0.windows.1
PowerShell 5.1.19041.6456   (importante: 5.1, no 7)
```

`gh auth status` (sin imprimir el token):

```
github.com
  ✓ Logged in to github.com account Just253 (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token scopes: 'delete_repo', 'gist', 'read:org', 'repo', 'workflow'
```

Consecuencias prácticas de esos scopes:

- Hay scope `repo` → se puede leer y escribir issues/PRs en repos privados y públicos.
- Hay scope `workflow` → se puede leer estado de GitHub Actions de workflows.
- **No** hay scope `admin:org` ni `project` → los Project (v2) pueden fallar; el diseño de abajo no
  depende de Projects, solo de issues, labels y comentarios.

Otras cosas medidas:

- Repos git locales: 17 bajo `C:\Users\GAMA\FilesForDev\Github` (ej. `autonoma-cli`, `clod`, `tres-nodos`).
  El directorio raíz **no** es repo git.
- `git config --global`: `user.name=Just253`, `user.email=70507145+Just253@users.noreply.github.com`,
  `pull.rebase=false`, `core.longpaths=true`. Todos los agentes que commiteen acá comparten identidad
  git: **el autor del commit no sirve para saber qué agente hizo qué**. Por eso hace falta el claim
  explícito en el issue (sección 6).
- `jq` **no** está en el PATH (sí existe en `D:\IDE\Scoop\src\apps\jq\1.7.1\jq.exe`).
- `bash` **no** está en el PATH (Git Bash sí: `D:\Languages\Git\Git\bin\bash.exe`).

Límites de API medidos con `gh api rate_limit`:

```
core:   5000/hora   (issues, PRs, commits, branches -> sobra)
search: 30/minuto   (gh search issues / gh search prs -> se agota rapidísimo)
graphql: 5000/hora
```

**Regla operativa:** el preflight usa `gh issue list --search` y `gh pr list --search` (van por el
endpoint de *list*, no por `/search`) y `gh api` REST. Prohibido usar `gh search issues` en loops: se
comió un `HTTP 403 secondary rate limit` en la primera prueba.

---

## 2. Los cuatro estados de una tarea

Todo reporte, antes de tocar código, se clasifica en uno de estos. El preflight devuelve exactamente
estos valores (`verdict.status`).

| Estado | Significado | Acción permitida |
|---|---|---|
| `NUEVO` | No hay issue, ni PR, ni rama, ni claim que lo mencione | Crear issue con evidence pack y claim |
| `REAL-ABIERTO` | Hay issue abierto con evidencia (score alto) y nadie lo está trabajando | Reclamar y arreglar |
| `EN-CURSO` | Hay PR abierto no-draft, o claim activo, o assignee con actividad | **No tocar**. Sumarse al issue/PR existente |
| `YA-RESUELTO` | Issue cerrado como `COMPLETED` o con PR de cierre mergeado | Verificar en el commit actual; si sigue fallando, es **regresión** (issue nuevo que referencia al viejo) |

Los dos errores que este esquema mata:

1. "Encontré un bug" → en realidad era `YA-RESUELTO` en otra rama mergeada.
2. "Ya lo arreglé" → en realidad no hay prueba que falle antes, ni commit, ni PR.

Y un tercero, el más caro: dos agentes arreglando lo mismo en ramas distintas porque nadie miró si
había `EN-CURSO`.

---

## 3. Huella de duplicados (`fingerprint`)

### 3.1 Formato

Un solo token, snake_case, prefijo `fp_`:

```
fp_<area>_<sintoma>
```

- `area`: **la misma de la label `area:*`** definida en `02-protocolo-coordinacion.md` §3.2
  (`web | api | infra | contracts`). Es lo que hace que huella, label y claim digan lo mismo.
- `sintoma`: comportamiento observable, en una o dos palabras, **no** la causa ni la solución
  (`login_timeout`, `dlq_stall`, `rounding_cents`). Si hace falta el subsistema, va acá:
  `auth_login_timeout` → `fp_api_auth_login_timeout`.

Ejemplos:

```
fp_api_auth_login_timeout
fp_api_billing_rounding_cents
fp_web_checkout_freeze
fp_infra_deploy_dlq_stall
```

### 3.2 Por qué así (hallazgo verificado)

Se probó empíricamente cómo tokeniza GitHub el texto de issues (`cli/cli`, 2026-11-23):

| Consulta | Resultados |
|---|---|
| `branch_associated_with_prunable_worktree` | 1 |
| `prunable_worktree` (substring de lo anterior) | 0 |
| `worktree` (palabra suelta) | 25 |

Conclusión: **los identificadores con guion bajo son tokens atómicos**. Buscar el token completo
matchea exactamente ese identificador y nada más; buscar un pedazo no matchea nada. Eso es
exactamente la propiedad que se necesita para deduplicar.

Además se verificó que:

- `"[bug]" in:body` devuelve resultados → los corchetes no rompen la query, pero **la puntuación se
  descarta al tokenizar**, así que `[area:auth]` no aporta unicidad.
- `"gh auth login" in:body` (frase entre comillas) funciona, pero meter comillas dentro de un
  argumento en PowerShell 5.1 es un dolor (ver anexo A). El token único evita el problema.
- Guiones y puntos SÍ fragmentan el token: `login-timeout` se indexa como `login` y `timeout`.
  Por eso `fp_api_auth_login_timeout` y nunca `fp:api.auth-login-timeout`.

### 3.3 Convención de título

```
[<area>/<sintoma>] <síntoma en una línea>            (bug)
```

```
[auth/login-timeout] Login se cuelga 30s y devuelve ECONNRESET
```

El título es para humanos y para el buscador por texto. La huella va en el body, en la primera línea:

```markdown
Huella: fp_api_auth_login_timeout
```

### 3.4 Label de área

Se usan las labels de área de `02-protocolo-coordinacion.md` (`area:web`, `area:api`, `area:infra`,
`area:contracts`), que además alimentan el prefijo de la huella. No se inventan áreas nuevas: si algo
no entra, es síntoma dentro de un área, no área nueva.

Como agregado de este doc, una sola label de estado para reportes sin evidencia:

- `status:needs-evidence` — falta el evidence pack de §5.1. **No** reemplaza a `status:triage` de 02:
  `triage` es "no está acotado", `needs-evidence` es "está acotado pero no se puede reproducir".

> Crear labels es escritura: DOCUMENTADO, no ejecutado acá.
> `gh label create "status:needs-evidence" --color BFD4F2 -d "Falta evidence pack"`

### 3.5 Búsqueda exacta por huella (PROBADO)

```powershell
# PowerShell 5.1: la huella va como token suelto, sin comillas internas
gh issue list -R owner/repo --state all --limit 20 --search "fp_api_auth_login_timeout in:body" `
  --json number,title,state,stateReason,labels,assignees,closedAt,url
```

```bash
gh issue list -R owner/repo --state all --limit 20 --search "fp_api_auth_login_timeout in:body" \
  --json number,title,state,stateReason,labels,assignees,closedAt,url
```

`in:body` restringe a texto del cuerpo (probado con `"gh auth login" in:body`). `--state all` incluye
cerrados: sin eso te comés el duplicado ya resuelto, que es el caso más común.

---

## 4. Preflight: los 6 bloques

Todo lo de esta sección está **PROBADO** salvo que diga lo contrario. Salidas recortadas.

### 4.1 Issues abiertos y cerrados por texto

```powershell
gh issue list -R cli/cli --state all --limit 5 --search "login timeout in:title" `
  --json number,title,state,stateReason,labels,assignees,updatedAt,closedAt,url,closedByPullRequestsReferences
```

Devolvió, por ejemplo:

```json
[{"number":14812,"title":"auth login/status hang silently ...","state":"OPEN",
  "stateReason":"","labels":[{"name":"bug"},{"name":"gh-auth"}],"assignees":[],"closedAt":null}]
```

Campos que importan y por qué:

- `state` + `stateReason` → `CLOSED`/`COMPLETED` es "resuelto"; `CLOSED`/`NOT_PLANNED` es "descartado"
  (distinto: no es que funcione, es que no se va a hacer).
- `closedByPullRequestsReferences` → PRs que referencian/cierran el issue. Probado que se puebla:
  `gh issue view 9789 -R cli/cli --json state,closedByPullRequestsReferences` → `{"st":"OPEN","prs":[14679]}`
  (el PR que lo va a cerrar). Ojo: si el issue se cerró **a mano** (sin "Fixes #"), este array viene
  vacío — lo vi en `#2669` (`CLOSED`/`COMPLETED`, `prs: []`). No confundir "sin PR de cierre" con
  "no se arregló": hay que mirar la timeline (4.1b).
- `assignees` → quien ya lo tomó.

### 4.1b Timeline: quién tocó este issue (PROBADO)

El signal más fuerte para anti-duplicados: todos los eventos `cross-referenced` (PRs y otros issues que
lo mencionan), incluso de issues cerrados a mano.

```powershell
gh api "repos/cli/cli/issues/9789/timeline?per_page=100" `
  --jq "[.[] | select(.event==\"cross-referenced\") | {num:.source.issue.number, isPr:(.source.issue.pull_request!=null), title:(.source.issue.title // \"\")}][0:4]"
```

Salida real:

```json
[{"isPr":true,"num":9787,"title":"Add acceptance tests for `gh auth` commands"},
 {"isPr":false,"num":10442,"title":"Persistent login issues"},
 {"isPr":true,"num":2299,"title":"Document local macOS release builds"}, ...]
```

También trae `closed`, `assigned`, `labeled`, `committed` según el caso. Es una request core por issue:
usarla en los 5-10 candidatos, no en todo el repo.


Verificado en un issue cerrado real:

```powershell
gh issue view 2669 -R cli/cli --json number,state,stateReason,closedAt,closedByPullRequestsReferences,labels `
  --jq '{n:.number, st:.state, reason:.stateReason, closed:.closedAt, prs:[.closedByPullRequestsReferences[].number]}'
# {"n":2669,"st":"CLOSED","reason":"COMPLETED","closed":"2021-01-12T17:16:13Z","prs":[]}
```

> Ojo con el `\"` en `--jq`. Ver anexo A: en PowerShell 5.1 las comillas internas hay que escaparlas
> con backslash o no llegan.

### 4.2 PRs, abiertos y cerrados, por texto

```powershell
gh pr list -R cli/cli --state all --limit 5 --search "login timeout" `
  --json number,title,state,isDraft,headRefName,reviewDecision,mergeStateStatus,files,updatedAt,url
```

`mergeStateStatus` útil: `DIRTY` = conflicto con base, `BLOCKED` = falta review/checks, `BEHIND` =
hay que rebasar. `files` dice si el PR toca tu área sin abrirlo.

También probado `--head <rama>` para "¿existe ya un PR de esta rama?":

```powershell
gh pr list -R owner/repo --state all --head "fix/auth-login-timeout" --json number,headRefName
```

### 4.3 Ramas remotas: ¿alguien ya empezó?

```bash
git ls-remote --heads https://github.com/owner/repo.git | sed -nE 's|.*refs/heads/(.*)$|\1|p'
```

PROBADO contra `Just253/autonoma-cli` (privado, con credential manager) → `refs/heads/main`.
Funciona con repos privados sin token explícito porque usa el helper de git ya configurado.

Fallback por API (si no hay git o el remoto no responde) — PROBADO:

```powershell
gh api "repos/cli/cli/branches?per_page=100" --jq ".[] | .name"
```

Y el filtro que importa: ramas cuyo nombre contiene las palabras del área.

```bash
git ls-remote --heads https://github.com/owner/repo.git \
  | sed -nE 's|.*refs/heads/(.*)$|\1|p' \
  | rg -i 'login|timeout|auth'
```

### 4.4 Quién está asignado y qué claims activos hay

Asignados salen en el `--json assignees` de 4.1. Los claims son comentarios `claim/v1`; se pueden
filtrar así (PROBADO contra `cli/cli#14812`, 3 comentarios reales):

```powershell
gh issue view 14812 -R cli/cli --json comments `
  --jq "[.comments[] | select(.body|test(\"^(?i)claim\")) | {author:.author.login, at:.createdAt}]"
# []  -> no hay claims en ese issue (correcto, no los tiene)
```

Ese filtro es solo para ver si hay algo. El estado real (`active`, `orphan`, `reclaim-pending`,
`reclaimed`, `released`) lo calcula el script parseando la línea completa, porque necesita el `ttl:`,
la huella y los heartbeats. Formato y política: sección 6.

### 4.5 Commits recientes que tocan el área

Por archivo o prefijo de ruta (PROBADO):

```powershell
gh api "repos/cli/cli/commits?path=internal/authflow/flow.go&since=2026-09-24T00:00:00Z&per_page=10" `
  --jq "[.[] | {sha:.sha[0:8], date:.commit.author.date, author:.commit.author.name, msg:(.commit.message|.[0:70])}]"
```

Salida real:

```json
[{"sha":"eddc987a","date":"2026-11-19T18:03:29Z","author":"BagToad","msg":"Detect expiring token support on GHES"}, ...]
```

Local, con más detalle y sin gastar API:

```bash
git log --since="30 days ago" --oneline -- src/auth src/api/login.ts
git log -L 1,60:src/auth/login.ts        # historia de un rango de líneas
```

`--since` acepta ISO 8601. El `path` va URL-encoded (`%2F` por `/`).

### 4.6 Estado de CI

Rama por defecto — PROBADO, con una trampa importante:

```powershell
$sha = gh api repos/cli/cli/commits/trunk --jq ".sha"
gh api "repos/cli/cli/commits/$sha/check-runs" --jq "[.check_runs[] | {name:.name,status:.status,conclusion:.conclusion}]"
```

Salida real: `[{"conclusion":"success","name":"CodeQL","status":"completed"}, ...]`

**Trampa:** `.../commits/main/check-runs` devuelve `422 No commit found for SHA: main`. El endpoint
exige un SHA, no un nombre de rama. Y `main` puede no ser la rama por defecto (`cli/cli` usa `trunk`):

```powershell
gh repo view cli/cli --json defaultBranchRef --jq ".defaultBranchRef.name"   # -> trunk
```

Por PR (PROBADO):

```powershell
gh pr checks 15108 -R cli/cli --json name,state,bucket
# [{"bucket":"pass","name":"CodeQL","state":"SUCCESS"}, ...]
```

`bucket` ∈ `pass | fail | pending | skipping | cancel`. **Trampa:** `gh pr checks` sale con código
≠ 0 cuando la rama no reportó checks (`no checks reported on the 'x' branch`). En un script hay que
tratarlo como "sin datos", no como error.

CI en verde no significa "arreglado": significa que los tests que existen pasan. Si nadie escribió un
test que reproduzca el bug, el verde no prueba nada. De ahí la sección 6.

---

## 5. Evidence pack mínimo

### 5.1 Para declarar que un problema es real

Un issue sin esto no se toma. Se etiqueta `status:needs-evidence` y se devuelve al reportante (humano
o agente).

| Campo | Contenido mínimo | Cómo se comprueba |
|---|---|---|
| Huella | `fp_<area>_<sintoma>` en la primera línea | búsqueda exacta, sección 3.5 |
| Commit | SHA completo + rama + versión | `git rev-parse HEAD`; debe existir en el remoto |
| Entorno | SO, runtime, versión de la app | texto |
| Pasos | numerados, copiables, sin "obvio" | otra persona los corre sin preguntar |
| Esperado | comportamiento correcto, concreto | texto |
| Actual | comportamiento observado + mensaje exacto | texto/log |
| Evidencia | log, salida de test, captura | archivo o bloque de código pegado |
| Alcance | rutas o módulo probable | `src/auth/**` |

Plantilla (pegar tal cual en el body del issue):

```markdown
Huella: fp_api_auth_login_timeout
Área: api        Labels: bug, area:api

## Pasos para reproducir
1. `git clone <repo> && cd <repo> && git checkout <sha>`
2. `cp .env.example .env`
3. `npm ci && npm run dev`
4. Abrir http://localhost:3000/login, usuario `demo@demo.com`, password `demo`
5. Click en "Entrar" y esperar

## Esperado
Redirección a `/dashboard` en menos de 2s.

## Actual
Spinner infinito. A los 30s, en consola:
```
POST /api/login 504 (Gateway Timeout)
Error: read ECONNRESET at TLSWrap.onStreamRead
```

## Commit y versión
- commit: 4f2c1ab (main), version 0.9.3
- SO: Windows 11 26100, Node 22.11.0

## Evidencia
- log: `login-timeout.log` (adjunto)
- captura: `login-spinner.png`
- test que falla: `npm test -- auth.login.spec.ts` -> 1 failed

## Alcance
- src/auth/**
- src/api/login.ts

## ¿Falla en limpio?
Sí, en clone limpio del commit 4f2c1ab con `.env.example`. No hace falta migrar datos.
```

El script puntúa la completitud de este body (0-100%, `evidence.score`) con las 6 secciones:
`repro | esperado | actual | commit | evidencia | huella`. Probado: el issue completo da 100%, un
"Hola, no anda" da 0%. Con menos de 67% el preflight lo reporta como reporte incompleto.

### 5.2 Para declarar que está resuelto

**Regla dura: sin prueba que falle antes y pase después, no está resuelto.**

Esa prueba es una de estas tres, y va pegada en el PR:

1. **Test de regresión** que falla en el commit base y pasa en el commit del fix.
2. **Script de reproducción** cuyo exit code cambia: `1` antes, `0` después.
3. **Comando de reproducción** con salida antes/después literal (para cosas no automatizables:
   UI, TLS, permisos del SO).

Formato obligatorio en el body del PR:

```markdown
## Qué arregla
Cierra #<issue> · Huella: fp_api_auth_login_timeout

## Prueba que falla antes y pasa después
Base: 4f2c1ab (sin el fix) -> FALLA
```
$ git stash && npm test -- auth.login.spec.ts
  1 failed  auth.login.spec.ts > timeout de 2s
  exit code 1
```
Fix: 9a1c3de -> PASA
```
$ npm test -- auth.login.spec.ts
  1 passed
  exit code 0
```

## Verificado en
- commit 9a1c3de, rama fix/auth-login-timeout
- local: Windows 11 / Node 22.11.0
- CI: run <url> (todos los checks en success)
- reproducción manual: login en <2s, sin ECONNRESET en 10 intentos

## Alcance del cambio
- src/auth/login.ts (espera con deadline)
- src/auth/login.spec.ts (test nuevo)
```

Y en el issue, al cerrar:

```markdown
resuelto-en: <sha mergeado>
verificado-por: <quien> en <fecha>
prueba: <path del test> (falla en <sha base>, pasa en <sha fix>)
```

Comandos para chequear el cierre antes de creerlo (PROBADO en sus partes de lectura):

```powershell
# 1. ¿el issue cerrado tiene PR de cierre? (si viene vacío, mirar la timeline de 4.1b)
gh issue view <N> -R owner/repo --json state,stateReason,closedByPullRequestsReferences

# 2. ¿ese PR tocó tests? (PROBADO)
gh pr view <PR> -R owner/repo --json files,state,mergeCommit --jq "{f:[.files[].path], st:.state, merge:.mergeCommit.oid}"

# 3. ¿el test existe hoy en la rama por defecto y pasa en CI?
gh api "repos/owner/repo/commits/<sha>/check-runs" --jq "[.check_runs[] | {name,conclusion}]"

# 4. local, en el commit del merge
git checkout <sha> && <comando de test> ; echo "exit=$?"
```

Si el PR no trae archivo de test nuevo ni salida "antes/después", el veredicto es **no verificado**:
se comenta en el issue y se reabre la discusión, aunque el estado diga `CLOSED`.

### 5.3 Tamaño mínimo de la evidencia (para no exigir de más)

- Bug de lógica: 1 test que falla + 1 línea de salida.
- Bug de integración/red: log de la request/response que falla, con timestamps.
- Bug de UI: captura antes + captura después, misma resolución.
- Bug de rendimiento: número, no adjetivo (`p95 = 4.8s` vs `p95 = 210ms`).

---

## 6. Protocolo de claims (quién está trabajando en qué)

Los claims viven en el **issue**, no en un archivo del repo: así no hay merges peleando por un
`claims.json` y el historial queda auditado por GitHub.

**La gramática canónica está en `02-protocolo-coordinacion.md` §3.2 y no se re-inventa acá.** Este
documento agrega una sola cosa: el campo `fp:` (huella), que es lo que permite cruzar un claim con la
búsqueda anti-duplicado. Y define cómo se **lee** ese estado, que es lo que hacen los scripts.

### 6.1 Formato (el de 02, más `fp:`)

Una línea, `clave:valor` separados por espacio, sin espacios dentro de los valores, timestamps UTC.
Después de una línea en blanco va lo humano y el parser lo ignora.

```text
claim/v1 issue:142 by:@ana agent:ana-lead-3f2a area:api branch:feat/api-142-oauth-refresh started:2026-11-23T14:02Z ttl:24h searched:2026-11-23 files:apps/web/src/sync/** fp:fp_api_auth_login_timeout
```

```text
heartbeat/v1 issue:142 agent:ana-lead-3f2a at:2026-11-23T20:10Z head:9c1e4ab state:coding
```

```text
release/v1 issue:142 by:@ana agent:ana-lead-3f2a reason:done at:2026-11-23T18:40Z pr:187 next:none
```

```text
reclaim/v1 issue:142 by:@caro agent:caro-lead-77c1 from:@ana agent:ana-lead-3f2a last_activity:2026-11-23T09:14Z evidence:9c1e4ab at:2026-11-24T11:00Z notice:12h
```

Campos que agrega este doc y por qué:

- `fp:` = la huella de §3.1. Es el único campo nuevo. Permite que un claim se encuentre buscando la
  huella aunque `area:` sea amplio (`area:api` cubre medio repo).
- Nada más. `area`, `branch`, `files`, `ttl`, `searched`, `head`, `state`, `reason`, `notice`,
  `next`, `pr`, `issue` ya están definidos en 02 y se usan tal cual.

Reglas heredadas de 02 (no las cambio, las resumo para tenerlas a mano al verificar):

- Un claim vigente por tarea; `ttl:24h` por defecto, `72h` para spikes.
- `files:` con globs de archivos calientes; solapamiento se detecta antes de escribir la primera línea.
- `heartbeat/v1` para trabajo largo, `release/v1` con `reason: done|handoff|abandoned|superseded|duplicate`.
- El claim se escribe con `scripts/claim.sh` (anexo D de 02), no a mano.

Comandos (DOCUMENTADO: escriben en GitHub; la escritura la hace `claim.sh`):

```bash
gh issue comment <N> -R owner/repo --body-file claim.txt     # el texto lo arma claim.sh
gh issue edit   <N> -R owner/repo --add-label status:claimed --add-assignee "@me"
```

### 6.2 Cómo se lee el estado (PROBADO por el script)

`preflight.ps1` / `preflight.sh` parsean **todos** los comentarios del issue abierto candidato y
calculan, por cada `claim/v1`:

| Condición (en este orden) | Estado |
|---|---|
| hay `release/v1` del mismo agente, posterior al claim y no futuro | `released` |
| hay `reclaim/v1` posterior y ya pasó su `notice:` | `reclaimed` |
| hay `reclaim/v1` posterior y el `notice:` todavía corre | `reclaim-pending` |
| sin actividad del agente hace más que el `ttl:` del claim (24h) | `orphan` |
| actividad entre 60% y 100% del `ttl:` | `expiring-soon` |
| el resto | `active` |

"Actividad" acá = `heartbeat/v1` del mismo agente, o el propio comentario del claim. El push a la rama
también es actividad según 02 §3.5, pero eso **no** se ve desde los comentarios: lo mira el orquestador
con `git log origin/<rama> --since=...` o `gh api "repos/o/r/commits?sha=<rama>&per_page=1"`. Un claim
`expiring-soon` con push reciente está sano; uno `orphan` con push reciente en realidad no lo está.

Verificado con fixtures (`scripts/fixtures/comments.json`) y contra comentarios reales de
`cli/cli#14812`: 4 comentarios, 0 claims, sin errores de parseo.

### 6.3 Cómo reclamar un huérfano sin pisar a nadie

Esto sigue 02 §3.5 al pie de la letra. Resumen operativo:

1. **Confirmar con dos señales independientes**, no una:
   - el preflight lo marca `orphan` (o `release` sin mergear/expirado), y
   - la rama no tiene commits nuevos: `gh api "repos/o/r/commits?sha=<rama>&per_page=1" --jq ".[0].commit.author.date"`, y
   - el PR asociado no tuvo updates: `gh pr list --head <rama> --state all --json number,updatedAt`.

2. **Aviso público con plazo (`notice:12h`)**, no takeover inmediato:

   ```text
   reclaim/v1 issue:142 by:@caro agent:caro-lead-77c1 from:@ana agent:ana-lead-3f2a last_activity:2026-11-23T09:14Z evidence:9c1e4ab at:2026-11-24T11:00Z notice:12h

   @ana: claim sin actividad desde el 22 (idle 51h, ttl 24h; rama sin commits nuevos; PR #187 sin updates).
   Si no hay heartbeat/v1 válido antes de 2026-11-24T23:00Z, sigo yo con fp_api_auth_login_timeout.
   ```

3. **Si el dueño aparece** con un `heartbeat/v1` válido dentro del notice: el reclaim queda anulado y
   gana el dueño original. Se dice explícitamente en un comentario, no se borra nada.

4. **Si no aparece**, el reclaim pasa a `reclaimed` por el paso del tiempo (no hace falta editar el
   comentario) y recién ahí:
   `gh issue edit <N> --remove-label status:claimed --add-label status:claimed --add-assignee "@me"`
   y claim nuevo con `inherits:` o `supersedes:` según 02 §3.6.

5. **Excepción 72h** (02 §3.5): si el último push tiene más de 72h y no hay PR, `notice:0h` y se
   reclama directo, avisando igual.

Lo que **no** se hace nunca: push a la rama ajena, `git push --force` sobre trabajo ajeno, borrar
comentarios, cerrar el issue de otro, editar el claim ajeno, ni "heredar por silencio".

### 6.4 Si el claim es ajeno pero está activo

No se reclama. Se comenta con lo que falte:

```markdown
Revisé el área: el test que falta es `src/auth/login.spec.ts` (no existe en la rama).
Si querés, lo escribo yo en un PR aparte contra tu rama. Sin claim nuevo.
```

---

## 7. Los scripts

### 7.1 `scripts/preflight.ps1` — Windows, sin jq (PROBADO)

```powershell
# sintaxis completa, contra un repo
powershell -NoProfile -ExecutionPolicy Bypass -File .\preflight.ps1 `
  -Repo owner/repo -Area api -Sym auth-login-timeout `
  -Text "login timeout" -Paths src/auth,src/api/login.ts -Days 30

# JSON para que lo lea otro agente
powershell -NoProfile -File .\preflight.ps1 -Repo owner/repo -Area api -Sym auth-login-timeout -Json

# reporte a archivo markdown
powershell -NoProfile -File .\preflight.ps1 -Repo owner/repo -Text "cursor reset" -OutFile .\reporte.md

# self-test offline (no toca red ni gh)
powershell -NoProfile -File .\preflight.ps1 -SelfTest      # 31 OK, 0 FAIL
```

Parámetros: `-Area` (área canónica: web/api/infra/contracts), `-Sym` (síntoma, admite subsistema:
`auth-login-timeout`), `-Text`, `-Paths` (array), `-Days` (30), `-ClaimTtlHours` (24, sólo se usa si el
claim no trae `ttl:`), `-Limit` (20), `-Json`, `-OutFile`, `-SelfTest`. Si omite `-Repo`, lo deduce del
directorio actual con `gh repo view` (PROBADO desde un clon).

Qué devuelve: veredicto (`NUEVO | REAL-ABIERTO | EN-CURSO | YA-RESUELTO`), issues con score de
evidencia, PRs, claims con estado, ramas candidatas, commits recientes, CI de la rama por defecto y
de los PRs abiertos.

### 7.2 `scripts/preflight.sh` — bash + jq (PROBADO con Git Bash)

```bash
export PATH="/d/IDE/Scoop/src/apps/jq/1.7.1:$PATH"   # jq en esta máquina
./preflight.sh --repo owner/repo --area api --sym auth-login-timeout \
               --text "login timeout" --paths src/auth,src/api/login.ts
./preflight.sh --repo owner/repo --area api --sym auth-login-timeout --json
./preflight.sh --selftest        # 16 OK, 0 FAIL (salta el bloque de claims si no hay jq)
```

Requiere `gh`, `git`, `jq`. Si falta `jq` muere con un mensaje que manda a usar `preflight.ps1`.

### 7.2b `claim/v1 in:comments` no sirve para decidir (PROBADO)

02 §7 propone `gh issue list --search "claim/v1 in:comments"` para encontrar claims. Sirve para
**poblar candidatos**, no para decidir: la búsqueda tokeniza y `claim/v1` son dos tokens (`claim` y
`v1`). Probado: ese query devolvió `cli/cli#14319`, un issue de CVE cuyos comentarios **no** contienen
`claim/v1` (verificado: `claim/v1` → False, `claim` → True, `v1` → True).

Por eso el preflight lee los comentarios del issue y parsea las líneas; el veredicto sale del parser,
no del buscador. La búsqueda por texto se usa para *encontrar issues*, el parseo para *saber qué pasa
dentro*.

### 7.3 Qué NO hacen los scripts

- No crean, editan ni cierran issues/PRs.
- No asignan, no etiquetan, no comentan.
- No hacen `push`, `checkout`, `merge` ni tocan el working tree.
- Solo lectura: `gh ... list/view/checks`, `gh api GET`, `gh repo view`, `git ls-remote`, `git log`.

Verificado leyendo el propio código: no hay ningún `POST`, `PATCH`, `DELETE`, ni `gh issue create`,
`gh pr create`, `gh issue edit` en ninguno de los dos archivos.

### 7.4 Uso típico de un agente antes de tocar nada

```text
1. preflight.ps1 -Area <area> -Sym <sintoma> -Text "<palabras>" -Paths <rutas>
2. Leer verdict.status:
   NUEVO         -> crear issue con evidence pack (sección 5.1) + claim (6.1)
   REAL-ABIERTO  -> reclamar (6.1) y arreglar
   EN-CURSO      -> no tocar; comentar en el issue/PR existente
   YA-RESUELTO   -> correr el repro en HEAD; si falla, abrir issue de regresión
3. Al terminar: PR con la prueba antes/después (5.2) + release del claim (6.1)
```

---

## 8. Anexo A: gotchas de PowerShell 5.1 con `gh` (todos reproducidos acá)

Estos son los que hacen fallar los scripts "que andaban en la doc".

1. **`@me` sin comillas se rompe.** `gh search issues --author @me` → PowerShell interpreta `@me`
   como splatting de la variable `$me` (vacía) y el query queda `Invalid search query "( all ) author:--state type:issue"`.
   Solución: `--author '@me'` o `--author=@me`.

2. **Comillas dobles dentro de un argumento no llegan.** `--search '"gh auth login" in:body'` →
   `unknown arguments ["auth" "login in:body"]`. PowerShell 5.1 rebuilds the native command line y se
   come las comillas. Solución: escaparlas con backslash: `--search '\"gh auth login\" in:body'`
   (PROBADO: devuelve resultados).

3. **Lo mismo con `--jq`.** `--jq '[.comments[] | select(.body|test("^claim"))]'` → `failed to parse
   jq expression`. Solución: `test(\"^claim\")`. Si podés, evitá jq en PowerShell y usá
   `--json` + `ConvertFrom-Json` (es lo que hace `preflight.ps1`).

4. **`--jq` con salida escalar no es JSON.** `gh api ... --jq .sha` imprime `7346a9cb...` sin comillas;
   `ConvertFrom-Json` explota con "Primitivo JSON no válido". Solución: leerlo como texto.

5. **`--jq` con `.[] | {…}` emite varios documentos, no un array.** `ConvertFrom-Json` falla con
   "Additional text encountered". Solución: envolver en array en el jq: `'[.[] | {...}]'`, o parsear
   línea por línea.

6. **`ConvertFrom-Json` devuelve un objeto, no un array, cuando hay un solo elemento.** Bajo
   `Set-StrictMode -Version 2.0`, `.Count` sobre eso tira `PropertyNotFoundStrict`. Solución:
   `return , @($parsed)` para que el array no se desenrolle.

7. **`-split "\n"` no funciona.** En PowerShell hay que usar backtick: `-split "`n"`, o el literal se
   rompe dentro de un argumento (`split(\n)` en el error de jq).

8. **Encoding de los `.ps1`.** PS 5.1 lee `.ps1` sin BOM como ANSI: los acentos se corrompen. Por eso
   `preflight.ps1` es ASCII (sin tildes). Si lo editás, guardalo UTF-8 con BOM o sin acentos.

9. **`gh pr checks` sale con código ≠ 0 si no hay checks.** Tratarlo como "sin datos", no como fallo.

10. **`gh api .../commits/<rama>/check-runs` no acepta nombre de rama.** Hay que resolver el SHA
    primero. Y la rama por defecto no siempre es `main`.

## 9. Anexo B: rate limits (medidos)

```
core:   5000/h  -> gh issue list, gh pr list, gh api, gh repo view
search:   30/m  -> gh search issues, gh search prs   (evitar en loops)
```

Un `gh issue list --search` no parece gastar la cuota de `search`: en las pruebas `search.used` quedó
en 0 y `core`/`graphql` no se movieron de forma visible, así que el contador de esa llamada no es
atribuible desde acá. Lo que sí está medido y firma el diseño: `gh search issues` reventó con
`HTTP 403 secondary rate limit` (límite 30/min). Por eso el preflight usa `gh ... list --search` y
`gh api` REST, y nunca `gh search` dentro de un loop.

Un preflight completo con 3 búsquedas + 10 lecturas de comentarios + 2 commits + 2 CI ≈ 20 requests → cabe 250 veces por hora.

Si aparece `HTTP 403 secondary rate limit`: esperar 60s y bajar `-Limit`. No reintentar en loop.

## 10. Anexo C: checklist de cierre

Antes de decir "listo":

- [ ] `preflight` corrido y veredicto citado en el issue o PR.
- [ ] Huella en el body del issue y en el título del PR (`Cierra #N · fp_...`).
- [ ] Evidence pack completo (score 100% o justificado).
- [ ] Test que falla en base y pasa en fix, con la salida pegada.
- [ ] CI en verde en el commit del fix (link al run, no "debería pasar").
- [ ] Claim cerrado con `release/v1 ... reason:done pr:<N>`.
- [ ] Si no se pudo verificar algo, está escrito como "no verificado", no omitido.
