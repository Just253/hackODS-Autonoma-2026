# AGENTS.md — `packages/domain`

Reglas de negocio puras en TypeScript: quién come, qué se cocina, qué entra y sale de la despensa,
cuánto cuesta y cuánto queda. **Sin React, sin Supabase, sin red, sin reloj del sistema.**

Modelo y alcance: `docs/DECISIONES.md` D2/D3/D4/D8.

## Qué es de este paquete

- **Entidades del contrato** (en `packages/contracts`, consumidas acá): `Persona` (solo `codigoP`
  `P-XXXX`), `Olla` (+ `tipo: comun | comedor_pca`), `Insumo`, `Receta`, `Servicio`, `Movimiento`,
  `Comprobante`, `Presupuesto` y `Captura`.
- **Presupuesto por olla**: `calcularPresupuesto()` — asignado/gastado/comprometido/disponible,
  proyección al cierre y alertas al 80 %/100 %, siempre desde movimientos append-only.
- **Serie de precios**: `medianaMovil()` — tendencia contra la mediana, exclusión por MAD y por rango,
  con `sin_dato` cuando no alcanzan las observaciones.
- **Conciliación de comprobante**: `conciliarComprobante()` — cuadra/faltante/sobrante por ítem.
- **Parser de captura** (texto o voz transcrita): `parsearCaptura()` — ítems, unidades y montos
  ambiguos marcados para revisión, nunca `parseFloat` sobre el texto.
- **Configuración de clasificación**: `CONFIG_CLASIFICACION` con los umbrales calibrados
  (`τ=0,69`, margen 0,04, piso 0,45); los tests no repiten los números.
- **Aritmética de dominio**: `mediana()`, redondeo, comparación de instantes.
- **Servicio del día**: `servirDelDia(menuFirmado, personas)` — porciones por grupo etario y
  total de raciones derivado del padrón vigente (`deletedAt === null`), nunca de una constante.
  `esMenuServible(template, platos)` cierra el TODO M3: exige estado `aprobado`/`publicado`,
  sello y hash del sello igual al del contenido (`serializarContenido`); si falla lanza
  `MenuNoServible` con el `campo` que no cuadra (`estado`, `sello`, `sello.hash`, `sello.version`,
  `porcion.<grupo>`). Sustituciones: solo las aprobadas en la plantilla; el resto queda
  `sin sustituto`, sin equivalencias inventadas. Categorías → grupo: `nino`→`menor_5`,
  `lactante`→`lactante_6_23m`, `adulto`/`adulto_mayor`/`gestante` iguales.
- **Stubs explícitos** (`serviciosDelDia`, `saldoDespensa`): lanzan
  `NoImplementado`; un stub que devuelve un número inventado es un bug.
- Errores tipados (`OllaCerrada`, `ServicioDuplicado`, `DatoFaltante`, `NoImplementado`, `MenuNoServible`).

## Qué NO es de este paquete

- Cálculo nutricional o composición de alimentos: `packages/nutrition`.
- Persistencia, SQL, RLS: `supabase/`.
- Outbox y conflictos: `packages/sync`.
- Textos de UI o formateo de moneda/fecha para pantalla: `apps/web` / `packages/ui`.
- Cifras que no tengan fuente: si falta, es `null`/`sin_dato` y viaja así hasta la UI.

## Comandos

```bash
pnpm --filter @hackods/domain test
pnpm --filter @hackods/domain typecheck
```

## Cómo se testea

- **Tabla de casos por regla**: válido, límite e inválido. Un `it` por fila.
- **Sin mocks de red**: si el test necesita red, la función está en el paquete equivocado.
- **Reloj e ids inyectados**: nada de `Date.now()` adentro de una regla.
- **Enteros**: dinero en céntimos, cantidades en milésimas; el test falla si aparece un float.
- **Property-based** (si ya está `fast-check`) para totales: sumar en cualquier orden da lo mismo.

## Reglas locales

1. Cero dependencias de runtime salvo `zod`. Es el paquete que todos importan: si pesa, pesa tres veces.
2. **Contrato primero**: un cambio de tipo se mergea en su PR (2 aprobaciones) **antes** que el código
   que lo usa. Cambio incompatible = `v2` en paralelo, no edición in-place.
3. Nada de `any`. `unknown` + parseo en el borde.
4. Los totales se **derivan**; nunca se guardan dos veces (un campo `total` que se puede desincronizar
   es un bug esperando).
5. Fechas en ISO 8601 con zona explícita; el día operativo de una olla es `America/Lima`.
6. Los nombres de campos y errores van en español peruano, como todo el repo.
7. Identidad: `codigoP` es la clave; ningún campo de nombre, DNI, teléfono o dirección entra acá (D2).
8. Solicitud entre ollas: transiciones `borrador→enviada→aceptada→entregada|cancelada` sin saltos
   (`TransicionInvalida` con estado e intento); entregar devuelve el **par** de movimientos
   `transferencia` (origen negativo, destino positivo, conservación a 0 — una solicitud nunca
   crea stock); unidades estrictas (`kg`→g; otra unidad → `UnidadNoSoportada`).
9. Reporte entre ollas: agrega **volumen movido** (`Math.abs(delta)`, no saldo ni neto) por
   categoría; la única puerta por donde sale un texto de categoría es `categoriaSegura` —
   `codigoP`, alias y proveedores no salen (test que se pone rojo si se anula).

## Dueño y revisión

Dueño: **C** (`area:contracts`). Requiere **2 aprobaciones** (A y B). Es el paquete más caro de
romper: una regla mal pensada bloquea a las otras dos personas.
10. Lint desde #7: sin variables sin usar (`^_` para ignorar deliberadamente) y sin
    `console.log`; el gate `pnpm lint`/`pnpm verificar` lo exige. El borrado de código
    muerto (`captura/parser.ts: siguienteMonto` en #7) es consecuencia de esta regla.
11. Métricas del producto (#55): `metricas.ts` **compone** las salidas de `servirDelDia` y
    `agregadoEntreOllas` — raciones, gramos y volumen nunca se recalculan; solo el padrón
    por categoría cuenta personas vigentes por sí mismo.
