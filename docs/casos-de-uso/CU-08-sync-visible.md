# CU-08 · De "N pendientes" a sincronizado

**Actor:** cualquiera que use la app y quiera saber si lo que anotó ya salió del dispositivo.
**Objetivo:** que el trabajo hecho sin red no se pierda y que el badge diga la verdad: cuántos cambios
están pendientes y cuándo quedaron sincronizados.

**Guion:** 2:50 (se enciende la red: "4 cambios pendientes → sincronizados")
**Área:** `web` + `sync` · **Estado:** sin empezar · Issue: #19

## Precondiciones

- Existe la interfaz `Outbox` con `eventUuid`, `lamport` y `deviceId` (`packages/sync/src/outbox.ts:23-31`),
  pero su única implementación es `OutboxMemoria`, un `Map` en memoria (`outbox.ts:39-77`): **no
  persiste**. El outbox persistente es parte de este CU, no una precondición.
- En esta ventana **el sync es local**: el badge cuenta la verdad del outbox, no habla con Supabase
  (`../MODO-6H.md` §5).

## Flujo

1. Con la red apagada, se hacen 4 cambios (una persona, una ración, un ítem confirmado, un precio).
2. El badge del shell muestra `4 pendientes`.
3. Se enciende la red. El módulo de sync intenta el lote (≤ 100 eventos).
4. El badge pasa a `sincronizado` con la hora del último lote.
5. Si algo falla, el contador **no** baja: los pendientes siguen ahí y se reintenta con backoff.

## Reglas que mandan

- `DEC-2026-0005` — UUIDv7 en el cliente, reloj de Lamport, desempate por `device_id`; `idempotency_key =
  event_uuid` evita duplicados; lotes ≤ 100 con reintento y backoff.
- `DEC-2026-0001` — `POST /sync/push` y `GET /sync/pull?since=` como funciones; en esta ventana no se
  llaman contra el remoto.
- `apps/web/AGENTS.md` — ninguna escritura va directo a Supabase: todo entra al outbox.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Badge | `apps/web/src/app/Shell.tsx` (solo PR #14) | `N pendientes` / `sincronizado` / `sin conexión`; hoy ese Shell solo tiene navegación, el badge hay que escribirlo |
| Lectura del outbox | `packages/sync` → `OutboxMemoria` | cuenta y ordena, no duplica; en memoria, se pierde al recargar. Falta una implementación Dexie |
| Registro de cambios | `apps/web/src/data/repositorio.ts` (solo PR #14) | hoy escribe Dexie y **no** importa `packages/sync`: no encola ningún evento. Hueco |
| Único punto de red | el módulo de sync | nada de `fetch` suelto en pantallas |

**Dónde vive esto hoy:** `Shell.tsx` y `data/repositorio.ts` no están en `main`; existen solo en el PR #14
(rama `origin/feat/web-1-skeleton`), verificado con
`git show origin/feat/web-1-skeleton:apps/web/src/app/Shell.tsx`. En `main`, `apps/web/src/app/` solo
tiene `App.tsx` y `router.tsx`.

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Tabla | `evento_sync` | `event_uuid`, `idempotency_key`, `lamport`, `device_id`, `entidad`, `payload`, `estado` |
| Endpoints | `supabase/functions/sync-push` y `sync-pull` | lote ≤ 100, aceptados/rechazados, sin `service_role` |
| Orden | `(lamport, device_id)` | el servidor respeta ese orden, no la hora del reloj |
| RLS | con el JWT del cliente | la función no bypasea RLS |

## Criterio de aceptación

- [ ] El badge lee un outbox **persistente**; recargar la app no lo resetea. Hoy `OutboxMemoria` se
      pierde en cada recarga: ese es el hueco que cierra este CU.
- [ ] Con 4 cambios y sin red, dice `4 pendientes`; al simular la red, pasa a `sincronizado`.
- [ ] El mismo `event_uuid` dos veces produce **un** evento (test que hoy no existe).
- [ ] Dos eventos del mismo segundo no se reordenan: gana `(lamport, device_id)`.
- [ ] Si el envío falla, el contador no baja y el error queda visible, no en consola.

## Prueba

```sh
pnpm --filter @hackods/sync test    # OutboxMemoria: orden y lote; idempotencia y persistencia, a escribir
pnpm --filter @hackods/web test     # test del badge a escribir: hoy solo corre pwa/contrato-sw.test.ts (#16)
pnpm verificar
```

Rojo→verde: quitar el `if (this.eventos.has(evento.eventUuid)) return` (`outbox.ts:46-48`) tiene que
duplicar el evento en el test. Aparte, quitar la validación `idempotencyKey === eventUuid`
(`outbox.ts:43-45`) rompe el test que la exige. Hoy `outbox.test.ts` cubre orden y lote, no duplicados:
ese test hay que escribirlo.

## Qué NO hace

- No sincroniza contra Supabase remoto en esta ventana (los endpoints existen, no se usan).
- No resuelve conflictos entre dispositivos reales: hay contrato, no escenario.
- No cifra el outbox con PIN (pendiente de `DEC-2026-0005`).

## Preguntas abiertas

- ¿El badge distingue "sin conexión" de "con conexión pero el envío falla"? Son dos verdades distintas.
- ¿Cuántos eventos se acumulan antes de avisar al usuario? Hoy se muestra el número, sin umbral.
- ¿El `pull` trae cambios de otra olla y cómo se mezclan con el detalle local?
- ¿El outbox persistente es una tabla Dexie propia o una copia local de `evento_sync`? La interfaz
  `Outbox` existe; la implementación que sobreviva a una recarga, no.
- ¿El badge vive en el `Shell.tsx` del PR #14 o en un layout nuevo de `main`? Hoy `main` no tiene Shell.
