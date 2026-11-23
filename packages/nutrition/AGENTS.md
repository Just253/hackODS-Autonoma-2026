# AGENTS.md — `packages/nutrition`

El motor nutricional como **contrato de interfaces**, no como tabla de valores. TypeScript puro.
**Este paquete no contiene ninguna cifra nutricional.**

Decisión vigente (`docs/DECISIONES.md` D3, manda sobre `docs/contracts/nutricion.md`):
la unidad de verdad es el **menú semanal firmado por nutricionista** y la **porción por grupo**.
El sistema **no prescribe dietas ni calcula requerimientos individuales**.

## Qué es de este paquete

- `src/contrato.ts` — `MenuSemanal`, `SelloMenu`, `PlatoMenu`, `Porcion`, `Restriccion`,
  `SustitucionAprobada`, `ReglasMotor`, `Contexto`, `ResultadoValidacion`.
- `src/reglas.ts` — `validarReglas()` y `crearContexto()`. Un umbral faltante lanza
  `ContratoInvalido` con la lista de campos; nunca se convierte en `0`.
- `src/menu.ts` — las cuatro funciones del contrato:
  - `validarMenu(menu, restricciones, ctx)`
  - `porcionParaGrupo(grupo, porcionBase, ctx)`
  - `sustituirInsumo(plato, origenId, sustituciones, ctx)`
  - `explicar(resultado, audiencia, ctx)`
- Overrides/validaciones inmutables: motivo + autor + versión + hash.

## Qué NO es de este paquete

- `calcularRacion(persona)` ni requerimientos por persona: **retirado** (D3).
- Tablas de composición, CSV de alimentos, kcal/proteínas/hierro hardcodeados, "valores típicos".
- Investigación de alimentos o búsqueda de fuentes: no es una tarea de este repo.
- Consejo médico, dietas, diagnósticos.
- UI, precios, costos (eso es `domain` / `apps/web`).
- Completar un `null` con un promedio "razonable". El `null` viaja hasta la UI.

## Menú firmado

- 2 perfiles × 2 opciones, 7 días, almuerzo y cena.
- Estados: `borrador → en_revision → aprobado → publicado → retirado`.
- Un menú `aprobado`/`publicado` sin sello es inválido:
  `{ nutricionista, cnp, fecha, version, hash }` y el hash SHA-256 debe coincidir
  con el contenido calculado por el motor.
- El sello lo emite una persona (nutricionista con CNP), nunca un modelo.
- Sustituciones: **solo** las aprobadas en la plantilla, con factor. Nada de equivalencias
  inventadas ni "parecidos razonables".

## Porción por grupo

- La porción la define el nutricionista para cada grupo etario (edad/condición).
- `porcionParaGrupo` aplica el factor configurado en `ReglasMotor`; no recalcula requerimientos.
- `menor_6m` no recibe ración: el resultado lo declara no resoluble y deriva a lactancia
  materna exclusiva.
- Alergia = veto absoluto de insumo, sugerencia y sustitución.

## Degradación

| Situación | Resultado |
|---|---|
| Menú completo y sello válido | `valido: true` |
| Sello ausente/hash distinto en estado aprobado/publicado | `valido: false` + hallazgo `firma` |
| Falta porción de un grupo obligatorio | hallazgo `porcion`, cobertura < 1 |
| Falta composición de un insumo | degrada: `insumosSinDato[]`, no rompe |
| Falta un umbral de `ReglasMotor` | **lanza `ContratoInvalido`** (no se degrada) |

## Comandos

```bash
pnpm --filter @hackods/nutrition test
pnpm --filter @hackods/nutrition typecheck
```

## Cómo se testea

1. `ReglasMotor` con valores `null` → `ContratoInvalido` y campos faltantes listados.
2. `gruposObligatorios` vacío → `ContratoInvalido`.
3. Menú `aprobado` sin sello → `valido: false` (cuando se implemente M3).
4. `porcionParaGrupo` nunca devuelve `cantidad <= 0` ni una unidad distinta de la firmada.
5. Los fixtures validan como JSON y **no contienen números nutricionales**.

## Reglas locales

1. **Cero cifras en el repo.** Si un PR agrega una kcal, una tabla o un "valor de referencia",
   se rechaza: no es la frontera de este paquete.
2. Todo umbral va en `ReglasMotor` con `[valor a confirmar]` hasta que una persona lo confirme.
3. Los proveedores se inyectan; el paquete no hace red ni lee archivos.
4. Nada de `any`. Los `null` son parte del tipo, no un error.
5. Los nombres de campos van en inglés; los motivos, en español.
6. El **75 °C** es checklist de inocuidad del servicio, no un cálculo de este paquete.

## Dueño y revisión

Dueño: **C** (`area:contracts`). Revisa **B** (datos y RLS de los overrides). Un cambio de contrato
necesita 2 aprobaciones y se mergea antes que sus consumidores.
