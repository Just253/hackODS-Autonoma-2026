---
description: Abre un problema identificado (PRB) o una decisión (DEC) con ID del registro.
agent: orquestador
---

Creá el registro de un **problema** con lo que sigue. Si falta el título, preguntá una sola cosa y
pará.

```bash
pnpm ids:nuevo --tipo PRB --categoria <categoria> --titulo "$ARGUMENTS"
```

Después:

1. Completá el cuerpo de la plantilla con lo que sabés **hoy**. Lo que no sepas queda en blanco, no
   inventado. Si no hay reproducción, el problema no es un bug: es una duda, y se dice así.
2. Buscá duplicados antes de commitear: `rg -l '<dos palabras del título>' docs/problemas docs/ids`.
   Si ya existe, cerrá el nuevo con `estado: duplicado_de:<ID>` en vez de tener dos.
3. Si el problema **ya es trabajo concreto**, abrí el issue y poné `relacionado: [#N]`; el PRB queda
   como el análisis, no como el trabajo.
4. Commit: `docs(problemas): <ID> <título corto>`.

**Categorías válidas:** dominio, datos, offline, backend, web, nutricion, dinero, seguridad, docs,
infra. Una categoría nueva necesita dos problemas que no entren en ninguna existente.

**Prohibido:** asignar el número a mano, renumerar IDs existentes, borrar un PRB (se marca
`descartado`), y meter datos personales reales en la evidencia.

**Salida:** el ID, la ruta del archivo, y la línea de la plantilla que quedó sin completar.
