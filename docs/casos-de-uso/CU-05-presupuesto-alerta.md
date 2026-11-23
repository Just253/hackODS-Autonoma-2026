# CU-05 · Ver cuánto queda y cuándo avisar

**Actor:** la organizadora que decide si alcanza para el resto de la semana.
**Objetivo:** saber cuánto se asignó, cuánto se gastó y cuánto queda, en enteros de céntimos, con aviso
**antes** de pasarse.

**Guion:** 1:40 (confirmar la boleta → gastado, disponible, alerta al 80 %)
**Área:** `web` + `contracts` · **Estado:** pantalla en `main` (PR #31) sobre fixture; confirmar no mueve el presupuesto (#9) · Issue: #10

## Precondiciones

- Hay un monto asignado por período para la olla (tabla todavía sin migración; ver Backend).
- Hay al menos una boleta con ítems confirmados (`CU-04`).

## Flujo

1. Se abre `/presupuesto` después de confirmar la boleta.
2. Se ven cuatro números: asignado, gastado, disponible y proyección al cierre.
3. Si el gasto pasa el 80 %, aparece la alerta con el porcentaje, sin bloquear la pantalla.
4. Si pasa el 100 %, la alerta cambia de tono y el disponible se muestra negativo, no en cero.
5. Se ve de qué boletas sale el gasto: tocar el número abre el detalle.

## Reglas que mandan

- `DEC-2026-0008` — presupuesto por olla y período con `asignado`, `gastado`, `comprometido`,
  `disponible`, `proyección al cierre`, alertas al 80 % y al 100 %. El monto inicial se guarda como
  `montoAsignadoInicialCentavos` (`packages/contracts/src/finanzas.ts:356`) y es inmutable; el `asignado`
  del panel es la suma de `asignacion`, `ajuste`, `traslado_entrada` y `traslado_salida`
  (`presupuesto.ts:18-23`, sumados en `presupuesto.ts:95`).
- `DEC-2026-0008` — dinero en **enteros de céntimos**; nunca un flotante con decimales sueltos.
- `DEC-2026-0008` — compras compartidas y donaciones en especie se registran aparte, con origen explícito.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Pantalla | `apps/web/src/features/presupuesto/` | 4 números + alerta + detalle por boleta |
| Cálculo | `@hackods/domain` → `presupuesto` | `asignado`, `gastado`, `comprometido`, `disponible`, `proyeccionCentimos`, `alertas` (`presupuesto.ts:51-68`) |
| Formato | la pantalla | `S/ 1 234,50` con separador de miles; nada de `1234.5` |
| Alerta | la pantalla | al 80 % y al 100 %, con el porcentaje visible |
| Datos locales | Dexie | **hueco**: en la rama del PR #14, `base.ts:50-53` solo declara `personas`, `raciones`, `identidadLocal` y `meta`; no hay `presupuesto` ni `comprobante_item` locales |

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Presupuesto | `presupuesto` + `movimiento_presupuesto` (contrato) | **sin migración**: `supabase/migrations/` tiene dos archivos (el init vacío y el modelo base) y ninguno crea estas tablas. El diseño está en `docs/contracts/comprobantes.md:301-321` (asignado inmutable en `monto_asignado_inicial_centavos`) y en `presupuestoSchema` (`packages/contracts/src/finanzas.ts:347-361`) |
| Gasto | `MovimientoPresupuesto` (append-only) | de ahí sale el gastado: `gasto`, `credito` y `anulacion` (`packages/domain/src/presupuesto/presupuesto.ts:95-98`), no de `movimientos`. `movimientos` es inventario de insumos, `delta` + `motivo` sin monto (`modelo_base.sql:216-229`) |
| Evento | `evento_sync` | **hueco**: ni `presupuesto.asignado` ni `item.confirmado` son valores de `entidad` (`modelo_base.sql:279-280`), y la tabla no tiene columna de tipo de evento. Falta decidir cómo viajan |
| RLS | por olla | el presupuesto de otra olla no se lee ni se compara (cuando exista la tabla; ver arriba) |

## Criterio de aceptación

- [ ] Los cuatro números se calculan con enteros de céntimos y coinciden con la suma de los ítems
      confirmados.
- [ ] Confirmar un ítem mueve el gastado; los `por_revisar` no.
- [ ] La alerta aparece al 80 % y al 100 %, con el porcentaje, y no bloquea el uso.
- [ ] El disponible negativo se muestra como negativo (no se satura en 0).
- [ ] Un presupuesto sin gasto dice `sin gasto`, no `S/ 0,00` con cara de dato.

## Prueba

```sh
pnpm --filter @hackods/domain test    # presupuesto: céntimos, alertas, proyección (presupuesto.test.ts:52)
pnpm --filter @hackods/web test       # a escribir: hoy no hay test de esta pantalla
pnpm verificar
```

El test de dominio ya existe y cubre el cálculo. El de la pantalla no: en `main`,
`apps/web/package.json:11` es `vitest run --passWithNoTests`, así que el comando queda verde sin correr
nada de esta pantalla.

Rojo→verde: usar `number` con decimales en el cálculo tiene que romper el test de céntimos.

## Qué NO hace

- No hace contabilidad ni facturación (fuera de alcance, `DEC-2026-0006`).
- No paga ni transfiere: registra lo que ya pasó.
- No compara el presupuesto entre ollas: eso es el agregado de `CU-07`.

## Preguntas abiertas

- ¿La tabla `presupuesto` y `movimiento_presupuesto` se crean antes de la demo? Hoy no hay migración y sin
  ellas el CU no se puede probar de punta a punta.
- ¿Con qué `entidad` viajan al outbox el presupuesto y la confirmación de un ítem? `evento_sync.entidad`
  no tiene `presupuesto` ni `comprobante` (`modelo_base.sql:279-280`), y no hay columna de tipo de evento.
- ¿El período es semanal, mensual o el que defina cada olla? El modelo dice período; el default no está
  decidido.
- ¿`comprometido` incluye lo pedido a otra olla y todavía no entregado? Debería; falta escribirlo.
- ¿La proyección al cierre usa el ritmo de gasto o el menú planificado? Son dos fórmulas distintas.
