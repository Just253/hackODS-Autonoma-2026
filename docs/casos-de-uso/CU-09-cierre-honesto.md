# CU-09 · Decir lo que la app no hace

**Actor:** el jurado, y cualquier persona que vaya a usar esto en una olla real.
**Objetivo:** que quede dicho en voz alta, y también en pantalla, qué **no** hace la app: no diagnostica,
no prescribe dietas, no guarda nombres en la nube.

**Guion:** 3:00 (cierre de la demo)
**Área:** ninguna (copy + criterio) · **Estado:** el pie del Shell dice «datos simulados / no es un diagnóstico»; faltan las otras dos frases

## Precondiciones

- Ninguna.

## Flujo

1. Al final de la demo, quien presenta lo dice sin que se lo pregunten.
2. En la app, la pantalla de inicio o un "Acerca de" repite las tres frases, cortas.
3. Ninguna pantalla promete un diagnóstico, una dieta ni un cálculo individual.

## Reglas que mandan

- `DEC-2026-0003` — el sistema no prescribe dietas ni calcula requerimientos individuales; ajusta porción
  por grupo y explica.
- `DEC-2026-0002` — el servidor nunca sabe quién es la persona; solo `P-XXXX`.
- `DEC-2026-0006` — alcance y demo: 3 minutos; lo que no entra se dice, no se insinúa.
- Regla dura de `../../AGENTS.md` §5.8 — sin fuente, es `sin dato`, no un promedio.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Texto de cierre | `apps/web` (inicio o "Acerca de") | tres frases, sin letra chica |
| Datos simulados | pie de pantalla | "datos simulados" visible en la demo |
| Nada de promesas | todas las pantallas | verbos como "sugiere", no "diagnostica" |

## Backend

No aplica. Si algún día hay una API pública, esta frase también va en su documentación.

## Criterio de aceptación

- [ ] Existe un texto visible en la app con las tres frases: no diagnostica, no prescribe dietas, no
      guarda nombres en la nube.
- [ ] El pie de la demo dice que los datos son simulados.
- [ ] Ninguna pantalla usa "diagnóstico", "dieta" ni "requerimiento" como algo que la app calcula.

## Prueba

```sh
rg -in 'diagnostica|prescribe|nombres en la nube' apps/web/src README.md
rg -in 'dieta|requerimiento' apps/web/src    # solo debería aparecer en las frases de "no hace"
```

No es un test automático: es una revisión de texto. Si molesta hacerla a mano, se puede sumar a
`pnpm verificar` como chequeo de términos.

## Qué NO hace

- No convierte esto en un aviso legal largo que nadie lee.
- No promete privacidad que no esté implementada: si el cifrado local no está, no se dice que está.
- No imprime folios ni hojas de servicio en la demo: `packages/printing` tiene el generador de folio
  (`packages/printing/src/folio.ts:27`), pero ninguna pantalla lo usa.

## Preguntas abiertas

- ¿Va en la pantalla de inicio o en un "Acerca de" que casi nadie abre? Yo pondría una línea en inicio y
  el detalle en "Acerca de".
- ¿Se dice también lo que falta (sync real, OCR de manuscrito) o solo lo que nunca va a hacer? La demo
  gana credibilidad si distingue "no hace" de "todavía no".
