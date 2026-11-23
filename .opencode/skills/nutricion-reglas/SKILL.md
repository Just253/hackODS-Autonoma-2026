---
name: Nutrición — contrato y reglas
description: Cómo se calcula el aporte sin tener cifras, cómo se inyectan los proveedores y cuándo el veredicto es insuficiente_datos. Cargar al tocar packages/nutrition, el veredicto nutricional o un override.
---

# Nutrición: contrato y reglas

## Cuándo se carga

- Tocás `packages/nutrition/**`.
- Una pantalla muestra kcal, aporte o un veredicto (`apto | deficit | insuficiente_datos`).
- Aparece un `null`, un `[valor a confirmar]` o un override.
- Alguien pide "agregar la tabla de alimentos" o "poner un valor aproximado".

## La frontera (decisión vigente 2026-11-23)

**Este repo no contiene valores nutricionales.** El paquete define el contrato y las reglas; los datos
los provee una implementación inyectada (`ProveedorComposicion`). La investigación de alimentos y las
tablas de composición las hace una persona con otros agentes, fuera de esta base de código.

Consecuencia práctica: si te piden "completar la tabla para que el test dé bien", la respuesta es **no**.
Se agrega un fixture con `null` y `[valor a confirmar]`.

## La cadena

```
ingredientes (id + gramos)
  → ProveedorComposicion (puede devolver null)
  → totales (solo con lo que hay; faltantes[] aparte)
  → ProveedorRequerimientos (población)
  → veredicto
```

Cada paso es una función pura. El proveedor es la única fuente de números y se inyecta en el test.

## Veredicto

| Situación | Resultado |
|---|---|
| Todo completo, dentro de tolerancia | `apto` |
| Todo completo, fuera de tolerancia | `deficit` |
| Falta edad o sexo | `insuficiente_datos` |
| Falta composición de un ingrediente | parcial + `faltantes[]` (degrada, no rompe) |
| Falta un umbral de `ReglasMotor` | parcial + `faltantes[]` (degrada, no rompe) |

**Solo edad y sexo** producen `insuficiente_datos`. Todo lo demás degrada. El motor nunca inventa un
dato para poder emitir un veredicto.

## Reglas duras

1. **Cero cifras en el repo**: ni kcal, ni gramos de referencia, ni "valores típicos". Si un PR las
   agrega, está en el paquete equivocado.
2. **No se completa un `null`.** Viaja hasta la UI y se muestra como "sin dato".
3. **Los umbrales son configuración**, con `[valor a confirmar]` hasta que una persona los confirme.
4. **No se estima por parecido** ni se interpola para que cierre.
5. **No hay consejo médico** ni afirmación de adecuación sin requerimientos inyectados y población
   declarada.
6. **No se declaran alérgenos** que no vengan del proveedor o de un override autorizado.
7. **Overrides inmutables**: motivo + autor + timestamp + hash chain. Sin motivo, no se aplica.

## Quién puede un override

| Campo | Autorizado |
|---|---|
| Veredicto y objetivos | nutricionista |
| Porciones y alta de alergias | organizadora de la olla |
| Cualquier otro | nadie: se rechaza |

## Qué se testea

- Fixture con `null` → parcial + `faltantes[]`, sin excepción.
- Sin edad o sexo → `insuficiente_datos`.
- Fixture completo → `apto` o `deficit` según reglas.
- Override con motivo → aplica y la cadena verifica; sin motivo → rechazado.
- Proveedor que lanza → parcial, no 500.
- Los fixtures no contienen números nutricionales.

## Anti-patrones

- Un CSV de composición "provisorio" en el repo (después queda para siempre).
- Rellenar con 0 en vez de `null` (0 es un dato, `null` es una ausencia).
- Calcular el veredicto en la UI para "no tocar el paquete".
- Un override que se edita en vez de agregar uno nuevo.

## Fuente

- Decisión del equipo del 2026-11-23 (`_hackods-plan/03-motor-nutricional.md`): alcance reducido a
  contrato de interfaz, dos proveedores inyectados, `ReglasMotor` con `[valor a confirmar]`, veredicto
  de tres valores, overrides inmutables con hash chain.
- `packages/nutrition/AGENTS.md` (frontera y contrato).
- `docs/nutricion/` — supuestos y valores pendientes de confirmar, **sin cifras inventadas**.
