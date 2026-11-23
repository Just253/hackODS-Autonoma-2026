---
description: Verifica un PR contra el gate. Read-only, con veredicto y evidencia.
agent: qa-verificador
subagent: false
---

Verificá el PR **$ARGUMENTS** sin confiar en su descripción.

1. `gh pr view $ARGUMENTS` y `gh pr diff $ARGUMENTS --name-only`. Leé la sección `## Prueba`. Si el
   comando que el autor dice haber corrido no está o no se puede ejecutar, veredicto `changes`.
2. Checkouteá en un worktree propio (`../wt/qa-$ARGUMENTS`), nunca en el del autor.
3. Corré el comando tal cual. Guardá la salida. Después volvé al commit base y comprobá que **falla**.
   Si pasa en los dos lados, la prueba no prueba nada: `changes`.
4. `gh pr checks $ARGUMENTS --required` y los tests del paquete afectado.
5. Alcance: compará `--name-only` con el `files:` del claim. Fuera del write-set = hallazgo.
6. Secretos: `git diff origin/main...HEAD | rg -i '(api[_-]?key|secret|token|passw|BEGIN .*PRIVATE)'`.
7. Escribí tu informe en `qa/evidencia/pr-$ARGUMENTS.md` (único archivo que podés escribir).

Devolvé el bloque de `qa-verificador`: veredicto, tabla de evidencia, hallazgos con `archivo:línea`, y
qué no verificaste. Si es `approve`, incluí la línea lista para pegar:
`review/v1 pr:$ARGUMENTS by:@<otra-cuenta> agent:<id> verdict:approve sha:<sha> gate:pass at:<UTC>`

**Prohibido:** aprobar tu propio trabajo, mergear, usar `--admin`, editar código, commitear, pushear,
"arreglar de paso". Un test que no pudiste correr se informa como "no verificado", nunca como aprobado.
