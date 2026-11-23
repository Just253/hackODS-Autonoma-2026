# AGENTS.md — `packages/nutrition`

El motor nutricional como **contrato de interfaces**, no como tabla de valores. TypeScript puro.
**Este paquete no contiene ninguna cifra nutricional.**

Decisión vigente (2026-11-23): la investigación de alimentos, las tablas de composición y los valores
los hace una persona con otros agentes. Acá viven las interfaces, las reglas y el veredicto.

## Qué es de este paquete

- `src/contrato.ts` — `ProveedorComposicion`, `ProveedorRequerimientos`, `ReglasMotor`, `Veredicto`.
- `src/motor.ts` — el flujo: ingredientes → proveedor → totales → veredicto.
- `src/reglas.ts` — configuración con **`[valor a confirmar]`**, nunca números inventados.
- `fixtures/` — 5 casos JSON con valores `null` y el marcador `[valor a confirmar]`.
- Overrides inmutables: motivo + autor + hash chain.

## Qué NO es de este paquete

- Tablas de composición, CSV de alimentos, kcal/proteínas/hierro hardcodeados, "valores típicos".
- Investigación de alimentos o búsqueda de fuentes: no es una tarea de este repo.
- Consejo médico, dietas, diagnósticos.
- UI, precios, costos (eso es `domain` / `apps/web`).
- Completar un `null` con un promedio "razonable". El `null` viaja hasta la UI.

## Contrato mínimo

```ts
export type Veredicto = 'apto' | 'deficit' | 'insuficiente_datos';

export interface ProveedorComposicion {
  // null = el proveedor no tiene el dato. El motor NO lo estima.
  porIngrediente(ingredienteId: string, gramos: number): Promise<Composicion | null>;
}

export interface ProveedorRequerimientos {
  para(poblacion: Poblacion): Promise<Requerimientos | null>;
}

export interface ReglasMotor {
  // todos los umbrales con [valor a confirmar]; se inyectan, no se escriben acá
  toleranciaDeficit: number | null;
  redondeo: { kcal: number; macros: number } | null;
}
```

## Veredicto y degradación

| Situación | Veredicto |
|---|---|
| Composición y requerimientos completos, dentro de tolerancia | `apto` |
| Composición completa, requerimientos completos, fuera de tolerancia | `deficit` |
| Falta edad o sexo (no se puede elegir población) | `insuficiente_datos` |
| Falta composición de un ingrediente, o un umbral | degrada: resultado parcial + `faltantes[]`, **no rompe** |

Regla: solo la falta de **edad/sexo** produce `insuficiente_datos`. Cualquier otro faltante degrada el
resultado y se muestra como parcial. El motor nunca inventa para "llegar" a un veredicto.

## Overrides

- Inmutables y auditables: `{ campo, valor, motivo, autor, timestamp, hash_previo }`.
- Quién puede: **nutricionista** → veredicto y objetivos; **organizadora** → porciones y alta de
  alergias. Nadie más.
- Un override sin motivo no se aplica. La cadena de hashes se verifica en un test.

## Comandos

```bash
pnpm --filter @hackods/nutrition test
pnpm --filter @hackods/nutrition typecheck
```

## Cómo se testea

1. Proveedor que devuelve `null` en un ingrediente → resultado parcial con `faltantes[]`, sin excepción.
2. Población sin edad o sexo → `insuficiente_datos`.
3. Caso completo con fixture → `apto` o `deficit` según `ReglasMotor`.
4. Override aplicado → veredicto cambia y la cadena de hash queda válida; override sin motivo → rechazado.
5. Proveedor que lanza error → el motor devuelve parcial, no un 500.
6. Los fixtures validan como JSON y **no contienen números nutricionales** (solo `null` y
   `[valor a confirmar]`).

## Reglas locales

1. **Cero cifras en el repo.** Si un PR agrega una kcal, una tabla o un "valor de referencia", se
   rechaza: no es la frontera de este paquete.
2. Todo umbral va en `ReglasMotor` con `[valor a confirmar]` hasta que una persona lo confirme.
3. Los proveedores se inyectan; el paquete no hace red ni lee archivos.
4. Nada de `any`. Los `null` son parte del tipo, no un error.
5. Los nombres de campos van en inglés; los motivos de override, en español.

## Dueño y revisión

Dueño: **C** (`area:contracts`). Revisa **B** (datos y RLS de los overrides). Un cambio de contrato
necesita 2 aprobaciones y se mergea antes que sus consumidores.
