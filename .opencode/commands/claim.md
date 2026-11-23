---
description: Reclama un issue listo, crea rama+worktree y abre el draft PR.
agent: orquestador
---

Reclamá el issue **$ARGUMENTS**. Si falta una precondición, pará y decí exactamente cuál.

Precondiciones (las tres):
1. `/preflight` corrido hoy, con el resultado citado.
2. El issue tiene `status:ready` (criterio de aceptación + prueba esperada escritos). Si está en
   `status:triage`, **no se reclama**: se acota primero.
3. No hay otro `claim/v1` vigente en el issue.

Secuencia:
```bash
gh issue view $ARGUMENTS --comments
gh issue develop $ARGUMENTS --base main --name <tipo>/<area>-$ARGUMENTS-<slug> \
  --worktree ../wt/$ARGUMENTS-<slug> --checkout
```
Comentá el claim en **una línea** (más una línea humana debajo):
```text
claim/v1 issue:$ARGUMENTS by:@<usuario> agent:<persona>-lead-<4hex> area:<area> branch:<rama> started:<UTC> ttl:24h searched:<fecha> files:<globs> fp:<huella>
```
Después: `status:claimed`, quitar `status:ready`, assignee, commit vacío `wip:` con trailer
`Agent: <id>`, `git push -u`, y `gh pr create --draft` con la plantilla del PR.

**Prohibido:** reclamar sin búsqueda del día; reclamar dos issues; reclamar un `status:triage`;
escribir código antes del draft PR; `git push` a `main`; force-push; mergear; pedir review todavía
(el PR queda draft hasta que el gate esté completo).

**Salida:** número de issue, rama, ruta del worktree, número de PR, y la línea `claim/v1` tal cual quedó.
