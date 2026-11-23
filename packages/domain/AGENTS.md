# AGENTS.md — `packages/domain`

El corazón del negocio en TypeScript puro: qué es una olla, una jornada, una ración, un aporte, y qué
combinaciones son válidas. **Sin React, sin Supabase, sin red, sin reloj del sistema.**

## Qué es de este paquete

- Tipos y esquemas Zod de las entidades (`Olla`, `Jornada`, `Racion`, `Aporte`, `Insumo`,
  `Movimiento`, `Socia`).
- Invariantes: no hay ración sin jornada, no hay jornada sin olla, no hay aporte negativo, los
  totales se derivan de eventos.
- Funciones puras de agregación: raciones del día, aportes de la semana, saldo de despensa.
- Errores de dominio tipados (`OllaCerrada`, `JornadaDuplicada`, `DatoFaltante`).

## Qué NO es de este paquete

- Cálculo nutricional: `packages/nutrition`.
- Persistencia, SQL, RLS: `supabase/`.
- Outbox y conflictos: `packages/sync`.
- Textos de UI o formateo de moneda/fecha para pantalla: `apps/web` / `packages/ui`.

## Comandos

```bash
pnpm --filter @hackods/domain test
pnpm --filter @hackods/domain typecheck
```

## Cómo se testea

- **Tabla de casos por invariante**: caso válido, caso límite, caso inválido. Un `it` por fila.
- **Sin mocks de red**: si el test necesita red, la función está en el paquete equivocado.
- **Reloj inyectado**: `crearJornada(input, { now })`, nunca `Date.now()` adentro.
- **Property-based** (si ya está `fast-check`) para totales: sumar en cualquier orden da lo mismo.

## Reglas locales

1. Cero dependencias de runtime salvo `zod`. Es el paquete que todos importan: si pesa, pesa tres veces.
2. **Contrato primero**: un cambio de tipo se mergea en su PR (2 aprobaciones) **antes** que el código
   que lo usa. Cambio incompatible = `v2` en paralelo, no edición in-place.
3. Nada de `any`. `unknown` + parseo en el borde.
4. Los totales se **derivan**; nunca se guardan dos veces (un campo `total` que se puede desincronizar
   es un bug esperando).
5. Fechas en ISO 8601 con zona explícita; el día operativo de una olla es `America/Lima`.
6. Los nombres de campos y errores van en inglés; los mensajes visibles, en español.

## Dueño y revisión

Dueño: **C** (`area:contracts`). Requiere **2 aprobaciones** (A y B). Es el paquete más caro de
romper: un tipo mal pensado bloquea a las otras dos personas.
