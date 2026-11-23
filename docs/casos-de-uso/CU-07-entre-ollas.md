# CU-07 · Pedir a otra olla y comparar sin nombres

**Actor:** dos organizadoras de ollas vecinas y una nutricionista que mira el conjunto.
**Objetivo:** que una olla pida insumos a otra y siga el estado del pedido, y que el reporte agregado
permita comparar ollas **sin exponer identidades**.

**Guion:** 2:30 (otra olla pide 20 kg de arroz; se acepta; agregado de 3 ollas sin identidades)
**Área:** `contracts` + `web` · **Estado:** PR #37 en revisión (dominio y pantallas); bloqueado por los ids UUID de los movimientos · Issue: #18

## Precondiciones

- Existen al menos 3 ollas ficticias con servicios y compras cargados.
- Hay stock disponible en la olla que presta (o se permite pedir igual y el pedido queda `enviada`).

## Flujo

1. La olla A abre `/solicitud` y pide 20 kg de arroz a la olla B, con una nota en el ítem
   (`solicitud_items.nota`); la fecha es la del registro.
2. La olla B ve el pedido y lo acepta o lo cancela; si lo entrega, pasa a `entregada`.
3. Entregar genera dos `movimientos` con `motivo = 'transferencia'`, uno en B y uno en A: nunca un saldo
   nuevo. Hoy nada une esos dos movimientos con la solicitud (ver Backend).
4. `/reporte` muestra el agregado de las 3 ollas: raciones servidas, gasto por categoría, sin nombres.
5. Cada olla ve su detalle; las demás, solo totales.

## Reglas que mandan

- `DEC-2026-0004` — `movimiento` es append-only (entrada, salida, merma, ajuste, **transferencia**); la
  despensa no guarda saldo mutable.
- `DEC-2026-0008` — reporte entre ollas: agregados por período y categoría, sin identidad de personas ni
  de proveedores; cada olla ve su detalle.
- `DEC-2026-0002` — ni `P-XXXX` ni alias en ningún agregado.
- `DEC-2026-0005` — cada cambio entra al outbox y viaja como evento idempotente
  (`idempotency_key = event_uuid`, orden `(lamport, device_id)`). El estado de la solicitud va en el
  `payload`; no hay columna de tipo de evento ni nombres `solicitud.*` en el esquema (ver Backend).

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Pantalla de pedido | `apps/web/src/features/solicitud/` | formulario corto: insumo, cantidad, a quién, nota |
| Pantalla de reporte | `apps/web/src/features/reporte/` | 3 columnas, una por olla; totales por categoría |
| Estado | la pantalla | `borrador`, `enviada`, `aceptada`, `entregada`, `cancelada` (`packages/contracts/src/domain.ts:87-93` y el CHECK de `supabase/migrations/20261123150000_modelo_base.sql:251-252`), con texto y no solo color. No existen `pendiente`, `aprobada` ni `rechazada`: rechazar es `cancelada` y hoy no se distingue |
| Datos locales | Dexie (a crear) | `solicitud`, `solicitud_item`, `movimiento`, `olla`; hoy la base de la rama del PR #14 solo tiene `personas`, `raciones`, `identidadLocal` y `meta` |
| Outbox | `packages/sync` | un evento por cambio con `entidad = 'solicitudes'` y el estado en el payload; `evento_sync` no tiene columna de tipo de evento (`20261123150000_modelo_base.sql:273-287`) |

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Tablas | `solicitudes`, `solicitud_items` | `solicitudes` tiene el par `olla_origen_id`/`olla_destino_id` y el `estado`; `solicitud_items` solo cantidad, unidad y nota: no hay estado por ítem, así que la entrega parcial no está soportada (`20261123150000_modelo_base.sql:247-267`) |
| Movimiento | `movimientos` | la columna es `motivo`, no `tipo`, y `motivo = 'transferencia'` es válido (`20261123150000_modelo_base.sql:221`). **No existen `olla_origen` ni `olla_destino`**: la única olla que identifica la fila es `olla_id` (`20261123150000_modelo_base.sql:216-229`). Hueco: para una transferencia entre ollas falta `solicitud_id` o `olla_contraparte_id`; hoy quedan dos filas sueltas, una por olla |
| Regla pura | `packages/domain` (nueva) | `crearSolicitud`, `resolverSolicitud`, `agregadoEntreOllas` |
| Agregado | vista o RPC | `security definer` con `search_path` explícito; devuelve totales, nunca filas crudas |
| RLS | `solicitudes_select`, `solicitud_items_select` | la olla ve las que la tocan, como origen o destino (`20261123150000_modelo_base.sql:419-423`); solo lectura: no hay policy de insert/update, el alta va por outbox |

## Criterio de aceptación

- [ ] Estados sin saltos: `borrador → enviada → aceptada → entregada | cancelada`; el salto inválido
      devuelve error tipado.
- [ ] Entregar genera **dos** `movimientos` con `motivo = 'transferencia'` (uno por olla) y **no**
      modifica ningún saldo. El vínculo movimiento ↔ solicitud no existe: se verifica por olla, insumo,
      delta y fecha.
- [ ] El agregado de 3 ollas se calcula sobre datos ficticios y cuadra con la suma de cada detalle.
- [ ] El agregado no contiene `P-XXXX`, alias ni nombres de proveedores (test que falla si aparecen).
- [ ] Cada olla ve su detalle; las otras dos, solo el total.

## Prueba

```sh
pnpm --filter @hackods/domain test    # estados, transferencia, agregado sin PII
pnpm --filter @hackods/web test       # pantallas con 3 ollas ficticias
pnpm verificar
```

Rojo→verde: quitar el filtro de identidad del agregado tiene que romper un test.

## Qué NO hace

- No mueve dinero entre ollas: es un pedido de insumos.
- No sincroniza entre dispositivos reales: en la demo las 3 ollas son datos locales (ver `CU-08`).
- No imprime el folio del pedido: la demo no imprime; `CU-09` lo dice en el cierre.

## Preguntas abiertas

- ¿Quién puede aceptar un pedido: cualquiera de la olla o solo la organizadora? `rol` existe; la regla no.
- ¿Una entrega parcial cierra el pedido o deja saldo por entregar? Hoy el estado no contempla parcial,
  porque `solicitud_items` no tiene estado ni cantidad entregada.
- ¿`movimientos` gana `solicitud_id` (o `olla_contraparte_id`) para no dejar dos filas sueltas por
  transferencia?
- ¿Rechazar necesita un estado propio o `cancelada` alcanza? El CHECK no tiene `rechazada`.
- ¿Los eventos de solicitud son `entidad = 'solicitudes'` con el estado en el `payload`, o hace falta un
  tipo de evento que hoy no existe?
- ¿El agregado es por período elegido o siempre el mes en curso?
