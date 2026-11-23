# CU-04 · Leer una boleta y revisar lo que no cuadra

**Actor:** la organizadora que vuelve del mercado con la boleta en la mano.
**Objetivo:** que los ítems de la boleta queden cargados, y que **nada entre al presupuesto sin que una
persona lo confirme**.

**Guion:** 1:10 (foto de boleta → 6 ítems → 2 en "por revisar" por umbral)
**Área:** `web` + `contracts` · **Estado:** sin empezar · Issues: #9 (pantalla), #5 (contratos), #6 (compute)

## Precondiciones

- Hay un catálogo de insumos con alias aprobados (los del seed ficticio alcanzan).
- El umbral de confianza está definido en `packages/domain/src/clasificacion/config.ts` (τ = 0,69).

## Flujo

1. Se abre `/comprobante` y se elige la boleta ficticia (en la demo no hay cámara).
2. La app muestra los 6 ítems con su texto crudo, cantidad, unidad y precio unitario.
3. Cuatro ítems quedan `confirmado`; **dos** quedan `por_revisar` porque la similitud con el catálogo es
   baja o hay empate.
4. Los `por_revisar` se muestran aparte, en rojo, con lo que la app cree que son y el alias más cercano.
5. La persona confirma o corrige. Recién al confirmar, el ítem suma al presupuesto.

## Reglas que mandan

- `DEC-2026-0008` — revisión humana obligatoria: **nada entra al presupuesto sin confirmar**.
- `DEC-2026-0008` — si la similitud es baja o hay empate, queda `por_revisar`; el catálogo aprende con
  alias aprobados, no con autoaprendizaje silencioso.
- `DEC-2026-0008` — unidades normalizadas a kg/L/unidad; si no se puede, el ítem conserva su unidad y
  queda fuera de la comparación.
- `DEC-2026-0007` — la boleta de la demo es ficticia; nada de proveedores reales.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Pantalla | `apps/web/src/features/comprobante/` | 6 ítems, estado por ítem, confirmar uno por uno |
| Umbral | `@hackods/domain` | `tau`, `margen` y `piso` se importan; la pantalla no compara números propios |
| Color | la pantalla | `por_revisar` en rojo suave, `confirmado` en verde; nunca solo color (texto también) |
| Datos locales | Dexie (a crear) | **a crear**: `comprobante`, `comprobante_item`, `insumo` y `alias_insumo`; la base del PR #14 (`base.ts:49-53`) solo tiene `personas`, `raciones`, `identidadLocal` y `meta` |
| Outbox | `packages/sync` | **hueco**: ni `comprobante.creado` ni `item.confirmado` son valores de `entidad` (`modelo_base.sql:279-280`); la tabla no tiene columna de tipo de evento. Falta decidir cómo viajan |

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Tablas | `docs/contracts/comprobantes.md` | comprobante, ítems, estados y revisión (issue #5) |
| Clasificación | `packages/domain/src/clasificacion/config.ts` | texto libre → producto; umbral y desempate |
| Cómputo | `packages/contracts/src/compute.ts` + `ComputePort` | vision/embeddings detrás de un port (#6) |
| Modo degradado | `ComputePort` | sin compute: los ítems entran todos `por_revisar` y la pantalla lo dice |
| Presupuesto | `presupuesto` + `movimiento_presupuesto` | **bloqueado**: sin migración (`supabase/migrations/` no crea ninguna de las dos) y el asiento por ítem queda fuera de v1 (`docs/contracts/comprobantes.md:331`); el campo opcional existe (`packages/contracts/src/finanzas.ts:373`), pero hoy no hay destino para el gasto. Ver `CU-05` |
| RLS | por olla | un comprobante de otra olla no se lee |

## Criterio de aceptación

- [ ] Los 6 ítems ficticios se muestran con texto crudo, cantidad, unidad y precio unitario.
- [ ] Exactamente 2 quedan `por_revisar` con los datos de la demo, y **no** afectan el presupuesto.
- [ ] Confirmar cambia el estado y **solo entonces** el ítem queda listo para el presupuesto; la suma queda
      bloqueada en Backend (tabla `presupuesto` sin migración, asiento por ítem fuera de v1), así que hoy se
      verifica el estado, no el total.
- [ ] Corregir el alias de un ítem lo deja `confirmado` y guarda el alias aprobado.
- [ ] Sin compute disponible, todo entra `por_revisar` y se muestra el motivo: no se adivina.

## Prueba

```sh
pnpm --filter @hackods/domain test     # conciliación: umbral, empate, confirmación
pnpm --filter @hackods/web test        # 6 ítems, 2 por revisar, confirmar uno y ver el estado
pnpm verificar
```

Rojo→verde: hacer que un ítem `por_revisar` pase a `confirmado` sin confirmación tiene que romper un test;
la suma al presupuesto queda bloqueada (ver Backend).

## Qué NO hace

- No hace OCR de manuscrito ni lee una foto real: la boleta es un fixture.
- No llama a ningún proveedor de vision en la demo (el port queda listo, ver #6).
- No concilia contra el precio de mercado: eso es `CU-06`.

## Preguntas abiertas

- ¿Un ítem corregido a mano aprende el alias para la próxima o solo para esa boleta? `DEC-2026-0008` dice
  alias aprobados: falta decidir quién aprueba.
- ¿Qué pasa con un ítem que no existe en el catálogo y nadie corrige? Hoy queda `por_revisar` para
  siempre.
- ¿El total de la boleta manda sobre la suma de ítems cuando no coinciden? No está decidido.
