# AGENTS.md — `docs/`

La memoria escrita del proyecto. Si una decisión no está acá, no existe.

```text
docs/
  DECISIONES.md        decisiones que mandan (D1–D9). Único nivel que decide
  PROTOCOL.md          claims, labels, ramas, gate. Único dueño de esa materia
  FUENTES.md           tabla tema → archivo canónico → commit o archivo:línea
  ids/REGISTRO.md      el único que emite identificadores (DEC/PRB/SPK)
  problemas/           un archivo por problema, por categoría
  decisiones/          decisiones nuevas (DEC), una por archivo
  spikes/              investigaciones con fecha límite (SPK)
  adr/                 por qué de una implementación, una por archivo
  contracts/           contratos implementables: sync, comprobantes, clasificacion, captura-voz
  historical/          insumos retirados (nutricion-pre-D3, experimentos). No se usan para decidir
  research/            PRD e insumos de producto (incluye la medición de embeddings)
  seguridad/           informes de auditoría (no políticas inventadas)
  planes/              planes de oleada y SINTESIS.md (los escribe el orquestador)

Jerarquía: `DECISIONES.md` decide · `contracts/` especifica · `adr/` explica · los `AGENTS.md` dan
reglas operativas y punteros · `historical/` no se cita como vigente. Si hay conflicto, gana el nivel
de arriba y la corrección va en el mismo PR.
```

## Qué es de este paquete

- `PROTOCOL.md` y sus anexos (plantillas de issue/PR, labels, CODEOWNERS).
- ADRs de 10 líneas: contexto, decisión, alternativas, consecuencias.
- Glosario y reglas de negocio **con fuente** (entrevista, documento, observación).
- Guías reproducibles: cada comando se copia y funciona.

## Qué NO es de este paquete

- Código, SQL, componentes.
- Cifras nutricionales o de costos inventadas. Si no hay fuente, se escribe `A CONFIRMAR` y se abre un
  issue.
- Decisiones nuevas sin issue: un ADR sin discusión previa es una opinión con formato.

## Comandos

```bash
# no hay build de docs; se valida así:
rg -n "TODO|A CONFIRMAR" docs/          # lo que falta, a la vista
rg -n "localhost|127\.0\.0\.1" docs/    # guías que solo funcionan en una máquina
```

## Cómo se revisa

- Un ADR se lee en 2 minutos. Si no, está mal escrito.
- Toda guía se prueba en una máquina distinta de la que la escribió (A escribe, B corre).
- Link roto = PR rechazado.

## Reglas locales

1. **Un ADR no se edita**: se supersede con otro y se marca `Superseded by ADR-00XX`.
2. **Cada afirmación del dominio lleva fuente**: `fuente: entrevista 2026-11-24, olla X` o
   `fuente: MIDIS, <documento>, p. 12`. Sin fuente, es hipótesis y se marca.
3. **Sin PII en ejemplos**: alias, no nombres; sin DNI, sin direcciones, sin fotos de personas.
4. **Español peruano**, sin regionalismos importados; "olla común", "persona", "ración" y "menú
   firmado" son los términos canónicos.
5. `PROTOCOL.md` y `CODEOWNERS` solo cambian por PR con **2 aprobaciones**.

## Dueño y revisión

Dueño: **C** (`area:infra`). Revisa **A** para las guías de web y **B** para las de datos. Un ADR que
cruza áreas necesita las dos.
