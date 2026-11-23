---
description: Busca duplicados antes de crear o reclamar un issue. Solo lectura.
agent: orquestador
---

Síntoma o tarea a investigar: **$ARGUMENTS**

Ejecutá el preflight y devolvé el veredicto. No crees ni edites nada.

1. Elegí área (`web | api | infra | contracts`) y una huella `fp_<area>_<sintoma>` en snake_case.
2. Corré el script (solo lectura):
   - Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight.ps1 -Area <area> -Sym <sintoma> -Text "<palabras>" -Json`
   - Linux/macOS/Git Bash: `bash scripts/preflight.sh --area <area> --sym <sintoma> --text "<palabras>" --json`
3. Leé `verdict.status` y respondé:

```text
Veredicto: NUEVO | REAL-ABIERTO | EN-CURSO | YA-RESUELTO
Evidencia: #<n> <título> — <estado> — <claim? assignee?> (máx. 3 líneas)
Siguiente: crear issue | reclamar #n | unirse a #n/PR #n | verificar en HEAD (regresión)
```

4. Si es `YA-RESUELTO`, corré la reproducción en `HEAD` antes de recomendar regresión.
5. Si el script falla, pegá el error exacto y **no improvises** con `gh search` en loop.

**Prohibido en este comando:** crear issues, comentar, asignar, etiquetar, reclamar, tocar archivos,
leer `.env`, ejecutar `gh search issues` en bucle (30 req/min y se bloquea).
