# ADR 0009 — Materializador del outbox (`evento_sync`)

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** B (area:api), revisa A
- **Issues:** #65 (paga la deuda D5 de `docs/contracts/sync.md:161`)

## Contexto

`sync-push` inserta eventos en `evento_sync` y nada los aplicaba: quedaban
`pendiente` para siempre. El contrato declaraba la materialización fuera de
alcance; #65 la trae. Sin proceso de fondo disponible (sin VPS, sin
`service_role`), la aplicación tiene que ocurrir dentro de una petición del
cliente con su JWT.

## Decisión

Una función SQL `security definer` aplica **un** evento (`app.aplicar_evento`) y
otra recorre los pendientes en orden `(lamport, device_id)` (`app.aplicar_pendientes`,
expuesta por `POST /functions/v1/sync-apply`), con tres reglas: (1) allowlist
entidad × rol (`app.mi_rol`); fuera de ella → `conflicto`, nunca excepción, para
que un evento no tumbe el lote; (2) los payloads inválidos se detectan **antes**
de la escritura (regex de `codigo_p`, máquina de estados de solicitudes, `op`
append-only) y, como red de seguridad, un error inesperado se captura al final de
la función y deja el evento en `conflicto` con `sqlerrm` como motivo; (3)
transacción por evento: al terminar la llamada, el estado del evento y la tabla
destino cambian juntas o no cambian. Los motivos se guardan en
`payload->>'_conflicto'` (no se agrega columna).

Medido en la DB local (`supabase db reset` + `pnpm db:test`): un
`begin ... exception` **alrededor del bloque de aplicación** rompe la escritura
bajo RLS. Con el bloque, el INSERT interior se evaluaba con el rol
`authenticated` del llamador en vez del dueño (`postgres`), y personas,
movimientos y solicitudes caían en `new row violates row-level security`
(conflicto falso). Sin el bloque, la misma sentencia escribe con el dueño. Por
eso la validación se hace a mano y solo la red de seguridad final (que sí corre
con el rol del llamador) usa subtransacción.

## Alternativas descartadas

- **Worker de fondo (pg_cron / M5):** no hay proceso persistente ni
  `service_role` en el despliegue; cron no trae el JWT del cliente.
- **Marcar `conflicto` lanzando y capturando afuera:** una excepción aborta el
  statement entero, así que el evento se quedaría `pendiente` y el resto del lote
  no correría.
- **Bloque `exception` alrededor de la aplicación (intentado):** bajo RLS cambia
  el rol efectivo de las escrituras del bloque a `authenticated` y todo INSERT
  legítimo moría con 42501 (medido). Se pasó a validación previa + red de
  seguridad final.
- **Aplicar sin allowlist (confiar en la RLS de `evento_sync`):** la RLS filtra
  por olla, no por rol: un evento de `menus` subido por una cocinera se aplicaría.
- **Columnas nuevas en `evento_sync` (`motivo`, `aplicado_en`):** toca el modelo
  y el contrato; queda como deuda si la revisión de conflictos lo pide.

## Consecuencias

- El cliente llama `POST /sync/apply` después de `sync-push`; sin llamada, los
  eventos siguen `pendiente` (el materializador es bajo demanda, no automático).
- `menus`/`raciones` quedan `conflicto` "fuera de alcance": la familia de menú se
  arma por `menu_template`/`dish`/`portion`, no por un documento entero.
- `movimientos`/`precios` son append-only: `delete` no se aplica (`conflicto`) y
  un `personas delete` también (el borrado es `deleted_at`, D2).
- **Deuda de contrato detectada:** `_shared/sync.ts` valida `op`, pero
  `sync-push` no lo persiste (no hay columna y `payload` es el objeto del
  cliente). El materializador aplica siempre `upsert`; un `delete` de cliente
  hoy entra como alta. Se paga con un issue de contrato (añadir `op` a
  `evento_sync` o al payload con una clave propia).
- Deuda: sin columna `motivo`, el conflicto vive en `payload->_conflicto`; una UI
  de revisión necesitará un índice/columna dedicados.
