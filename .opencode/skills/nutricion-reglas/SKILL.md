---
name: Nutrición — menú firmado y porción por grupo
description: Cómo funciona el menú semanal firmado, la porción por grupo y las sustituciones aprobadas, sin cifras ni requerimientos individuales. Cargar al tocar packages/nutrition o un menú/validación.
---

# Nutrición: menú firmado y porción por grupo

## Cuándo se carga

- Tocás `packages/nutrition/**`.
- Una pantalla muestra un menú, una porción o una validación.
- Aparece un `null`, un `[valor a confirmar]` o un sello de nutricionista.
- Alguien pide "agregar la tabla de alimentos", "calcular la ración de esta persona" o
  "poner un valor aproximado".

## La frontera (vigente: `docs/DECISIONES.md` D3)

**Este repo no contiene valores nutricionales.** Tampoco calcula requerimientos individuales.
La unidad de verdad es el **menú semanal firmado por nutricionista**:

- 2 perfiles × 2 opciones, 7 días, almuerzo y cena.
- Estados: `borrador → en_revision → aprobado → publicado → retirado`.
- Sello obligatorio: nombre del nutricionista, colegiatura CNP, fecha, versión y hash SHA-256
  del contenido. Sin sello no hay menú aprobado, y sin aprobación no se publica.
- El sistema **valida** el menú contra sus restricciones y **ajusta la porción por grupo**.
  No prescribe dietas ni decide por la persona.

Consecuencia práctica: si te piden "completar la tabla para que el test dé bien", la respuesta es **no**.
Se agrega un fixture con `null` y `[valor a confirmar]`.

## La cadena

```
menú firmado (días, platos, ingredientes, porciones por grupo)
  → ReglasMotor (tolerancias y umbrales, todos [a confirmar])
  → restricciones (alergia, dieta, frecuencia, inocuidad)
  → ResultadoValidacion (hallazgos + cobertura + hash recalculado)
  → porcionParaGrupo (factor por grupo, sin inventar equivalencias)
  → sustituirInsumo (solo sustituciones aprobadas + factor)
  → explicar (organizadora | nutricionista)
```

Cada paso es una función pura. El proveedor de composición se inyecta y es la única fuente de números.

## Contrato expuesto

| Función | Devuelve | Regla clave |
|---|---|---|
| `validarMenu(menu, restricciones, ctx)` | `ResultadoValidacion` | sello + hash + restricciones |
| `porcionParaGrupo(grupo, porcionBase, ctx)` | `PorcionAjustada` | factor de reglas; nunca cero ni unidad distinta |
| `sustituirInsumo(plato, origen, sustituciones, ctx)` | `ResultadoSustitucion` | solo aprobadas, con factor |
| `explicar(resultado, audiencia, ctx)` | `TextoExplicativo` | sin tecnicismos para la organizadora |

`ReglasMotor` incompleto **no degrada**: lanza `ContratoInvalido` con la lista de campos.
Un umbral faltante no puede convertirse en `0`.

## Reglas duras

1. **Cero cifras en el repo**: ni kcal, ni gramos de referencia, ni "valores típicos".
2. **No se completa un `null`.** Viaja hasta la UI y se muestra como "sin dato".
3. **Los umbrales son configuración**, con `[valor a confirmar]` hasta que una persona los confirme.
4. **Sustituciones solo aprobadas**: nada de "parecido razonable" ni equivalencias inventadas.
5. **Alergia = veto absoluto** de insumo, sugerencia y sustitución.
6. **`menor_6m` no recibe ración**: se declara no resoluble y se deriva a lactancia materna.
7. **No hay consejo médico** ni diagnóstico; el sistema valida un menú, no trata a nadie.
8. **El 75 °C es checklist de inocuidad** del servicio `cocido_a_75c`, no un cálculo nutricional.
9. **No se declaran alérgenos** que no vengan del catálogo o de una corrección autorizada.
10. **Sellos inmutables**: si cambia el contenido, cambia la versión y el hash; no se edita el sello.

## Badge de origen

`procedencia ∈ sugerencia_sistema | validado_nutricionista | ajustado_organizadora | sin_revisar`.
El badge viaja con el resultado; no se calcula en la vista.

## Qué se testea

- `ReglasMotor` con `null` → `ContratoInvalido` y campos faltantes.
- `gruposObligatorios` vacío → `ContratoInvalido`.
- Menú aprobado sin sello o con hash distinto → inválido (M3).
- `porcionParaGrupo` respeta la unidad firmada y no devuelve cantidades no positivas.
- Los fixtures no contienen números nutricionales.

## Anti-patrones

- Un CSV de composición "provisorio" en el repo (después queda para siempre).
- Volver a `calcularRacion(persona)` o a requerimientos individuales.
- Rellenar con 0 en vez de `null` (0 es un dato, `null` es una ausencia).
- Aprobar un menú sin CNP o sin hash "porque es demo".
- Cambiar un umbral en el código para que un test pase.

## Fuente

- `docs/DECISIONES.md` D3 (manda sobre `docs/contracts/nutricion.md`).
- `docs/contracts/nutricion.md` — contrato histórico, queda como insumo.
- `packages/nutrition/AGENTS.md` — frontera y contrato vigente.
