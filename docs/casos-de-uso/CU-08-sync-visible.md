# CU-08 · De "N pendientes" a sincronizado

**Actor:** cualquiera que use la app y quiera saber si lo que anotó ya salió del dispositivo.
**Objetivo:** que el trabajo hecho sin red no se pierda y que el badge diga la verdad: cuántos cambios
están pendientes y cuándo quedaron sincronizados.

**Guion:** 2:50 (se enciende la red: "4 cambios pendientes → sincronizados")
**Área:** `web` + `sync` · **Estado:** implementado en `main` (#67); outbox Dexie y badge reactivo, con
sync **local** (no habla con Supabase) · Issue: #19

## Precondiciones

- Existe la interfaz `Outbox` con `eventUuid`, `lamport` y `deviceId` (`packages/sync/src/outbox.ts`).
  `apps/web` la implementa sobre Dexie con `OutboxDexie` (`data/outbox-repo.ts`): la tabla `outbox`
  (esquema v4) es la que hace que el conteo sobreviva a una recarga.
- En esta ventana **el sync es local**: el badge cuenta la verdad del outbox, no habla con Supabase
  (`../MODO-6H.md` §5).

## Flujo

1. Con la red apagada se hacen cambios. Hoy los que encolan son el alta de persona y la ración.
2. La pastilla del header muestra `N cambios pendientes de sincronizar (local)`, sin recargar.
3. Se toca `Sincronizar ahora (local)`. `SyncLocal` toma el lote (≤ 100 eventos) y marca cada uno
   como enviado; no hay `fetch`.
4. La pastilla vuelve a `En este dispositivo` (nunca "Sincronizado" a secas: no hay servidor).
5. Si algo falla, el contador **no** baja: `marcarError` no borra el evento.

## Reglas que mandan

- `DEC-2026-0005` — UUIDv7 en el cliente, reloj de Lamport, desempate por `device_id`; `idempotency_key =
  event_uuid` evita duplicados; lotes ≤ 100 con reintento y backoff.
- `DEC-2026-0001` — `POST /sync/push` y `GET /sync/pull?since=` como funciones; en esta ventana no se
  llaman contra el remoto.
- `apps/web/AGENTS.md` — ninguna escritura va directo a Supabase: todo entra al outbox.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Badge | `apps/web/src/app/Shell.tsx` | la pastilla del header. Con eventos sin enviar dice `N cambios pendientes de sincronizar (local)` y ofrece `Sincronizar ahora (local)` (header en escritorio, hoja "Más" en el teléfono); sin pendientes vuelve a `En este dispositivo`. Se actualiza al encolar y al enviar: `OutboxDexie` avisa por suscripción, sin `setInterval` |
| Lectura del outbox | `apps/web/src/data/outbox-repo.ts` (`OutboxDexie`) | implementa `Outbox` de `packages/sync` sobre Dexie v4 (tabla `outbox`), con espejo en memoria y `suscribir/avisar`; ordena por `(lamport, deviceId)` y sobrevive a la recarga |
| Registro de cambios | `apps/web/src/data/repositorio.ts` | `altaPersona` y `guardarRacion` encolan el evento en **la misma transacción** (`encolarEnTransaccion`) y lo dan por pendiente recién al confirmar (`registrarConfirmado`); una transacción que aborta no deja pendiente |
| Único punto de red | el módulo de sync | nada de `fetch` suelto en pantallas. Hoy `SyncLocal` marca los eventos como enviados sin red |

**Dónde vive esto hoy:** todo en `main` + este cambio: `apps/web/src/app/Shell.tsx` (cascarón con rail
en PC y barra de 4 + "Más" en el teléfono), `apps/web/src/data/{base,outbox-repo,repositorio,sync-local}.ts`
y los tests `apps/web/src/app/Shell.spec.tsx` y `apps/web/src/data/outbox.spec.ts`.

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Tabla | `evento_sync` | `event_uuid`, `idempotency_key`, `lamport`, `device_id`, `entidad`, `payload`, `estado` |
| Endpoints | `supabase/functions/sync-push` y `sync-pull` | lote ≤ 100, aceptados/rechazados, sin `service_role` |
| Orden | `(lamport, device_id)` | el servidor respeta ese orden, no la hora del reloj |
| RLS | con el JWT del cliente | la función no bypasea RLS |

## Criterio de aceptación

- [x] El badge lee un outbox **persistente**: la tabla `outbox` de Dexie (v4) sobrevive a recargar; el
      test de `outbox.spec.ts` cierra y reabre la base y el pendiente sigue ahí.
- [x] Con cambios sin enviar la pastilla dice `N cambios pendientes de sincronizar (local)`; tras
      `Sincronizar ahora (local)` vuelve a `En este dispositivo` sin recargar.
- [x] El mismo `event_uuid` dos veces produce **un** evento (en el espejo y en la tabla).
- [x] Dos eventos del mismo segundo no se reordenan: gana `(lamport, device_id)`.
- [x] Si el envío falla, el contador no baja: `marcarError` no borra el evento.
- [x] Una transacción que aborta (`RacionDuplicada`) no deja pendiente ni avisa al badge.

## Prueba

```sh
pnpm --filter @hackods/sync test                      # contrato `Outbox`: orden y lote
pnpm --filter @hackods/web exec vitest run src/data   # outbox Dexie: idempotencia, persistencia, avisos
pnpm --filter @hackods/web exec vitest run src/app/Shell.spec.tsx   # badge 0 → 1 → 0 sin recargar
pnpm verificar
```

Rojo→verde de la reactividad: quitando `outbox.suscribir(leer)` del efecto de `useOutbox`, el badge se
queda en `En este dispositivo` después del alta y el test del Shell falla (2 de 4). Restaurado: 4 pasan.

## Qué NO hace

- No sincroniza contra Supabase remoto en esta ventana (los endpoints existen, no se usan; `SyncLocal`
  marca como enviado sin red).
- No resuelve conflictos entre dispositivos reales: hay contrato, no escenario.
- No cifra el outbox con PIN (pendiente de `DEC-2026-0005`).

## Preguntas abiertas

- ¿El badge distingue "sin conexión" de "con conexión pero el envío falla"? Son dos verdades distintas.
- ¿Cuántos eventos se acumulan antes de avisar al usuario? Hoy se muestra el número, sin umbral.
- ¿El `pull` trae cambios de otra olla y cómo se mezclan con el detalle local?
