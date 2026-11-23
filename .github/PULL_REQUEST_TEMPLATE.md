## Qué cambia

<!-- 1-3 líneas. El "qué", no el "cómo". -->

Closes #

## Prueba

> Sin esta sección completa el PR no se marca ready y no se pide review.
> El revisor va a correr el comando de acá. Si no lo puede correr, no es evidencia.

**1. Reproducción (antes)**
<!-- Comando exacto + salida. Para feat: estado previo / caso que fallaba. -->

```sh
$
```

**2. Salida antes (rojo)**

```text

```

**3. Salida después (verde)**

```text

```

**4. Prueba automatizada**
- Test: `ruta/al/archivo.spec.ts > nombre del test`
- Falla antes: sí / no aplica
- Pasa después: sí

**5. CI**
- `gh pr checks <n> --required` →
- Run:

**6. Captura / video** (si es UI)
<!-- Arrastrá el archivo o usá: gh pr comment <n> --attach ./captura.png#alt -->

**7. Cómo revertir**
<!-- `git revert <sha>` / flag / migración inversa. Si no se puede revertir, decilo. -->

## Alcance

- Área: `area:`
- Issue: #
- Archivos tocados fuera del área declarada en el claim: ninguno / (justificar)
- Líneas: | Archivos:
- ¿Toca `packages/contracts/**`? no / sí → PR de contrato: #

## Criterios de aceptación

<!-- Copiados del issue, uno por uno, con la evidencia al lado. -->

- [ ] criterio 1 — evidencia:
- [ ] criterio 2 — evidencia:

## Checklist del autor (orquestador)

- [ ] `claim/v1` vigente en el issue
- [ ] Rama rebasada sobre `origin/main` (sin merge commits)
- [ ] CI verde en el último commit
- [ ] Sin secretos ni `.env` en el diff
- [ ] Solo archivos del alcance (o justificados arriba)
- [ ] Docs/ADR actualizados si cambió comportamiento
- [ ] PR ≤ 400 líneas y ≤ 10 archivos (si no, explicar por qué no se partió)
- [ ] Un solo PR para este issue

## Review

<!-- La completa el revisor, no el autor. -->

- Revisor: @
- `review/v1 pr: by: agent: verdict: sha: gate:`
- Corrí el comando de "Prueba": sí / no
- Revisé el diff completo: sí / no

## Notas para el revisor

<!-- Dónde mirar primero, qué te genera dudas, qué probaste y qué no. -->
