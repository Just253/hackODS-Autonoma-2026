---
name: PWA offline (IndexedDB y outbox)
description: Cómo se guarda y sincroniza sin red, cómo se evitan duplicados y conflictos, y qué se testea. Cargar al tocar apps/web, service worker, IndexedDB o packages/sync.
---

# PWA offline: IndexedDB y outbox

## Cuándo se carga

- Agregás una pantalla que **escribe** (persona, servicio, movimiento, comprobante, captura).
- Tocás el service worker, el precache o una estrategia de red.
- Aparece "se duplicó", "se perdió", "quedó pendiente" o "dos teléfonos muestran distinto".

## Principio

La red es opcional; el dato local es la verdad inmediata. La UI **nunca** espera al servidor para
confirmar. Toda escritura entra al outbox, se muestra optimista y se reconcilia después.

## Capas

```text
Pantalla (apps/web)
  └─ repositorio local (lee IndexedDB, aplica optimista)
       └─ outbox (packages/sync)  →  adaptador remoto  →  Supabase
       └─ pull incremental (since = último cursor)
```

Nadie escribe en Supabase desde una pantalla. Si hay un `fetch` en un componente, está mal.

## IndexedDB

- Una base por olla (`hackods-<olla_id>`), versión explícita y migraciones por `onupgradeneeded`.
- Stores: `personas`, `servicios`, `movimientos`, `insumos`, `recetas`, `comprobantes`, `outbox`, `meta`.
- Índices mínimos: `por_fecha` en servicios, `por_servicio` en raciones, `por_estado` en outbox.
- Los blobs (foto de voucher) van aparte y se referencian por id; no se duplican en cada lista.
- `navigator.storage.persist()` al primer uso y un botón de **exportar respaldo JSON**.

## Registro del outbox

```ts
type OutboxItem = {
  eventUuid: string;      // UUIDv7 del dispositivo
  idempotencyKey: string; // = eventUuid
  lamport: number;        // reloj de Lamport, no Date.now()
  deviceId: string;       // desempate
  ollaId: string;
  entity: 'personas' | 'servicios' | 'movimientos' | 'comprobantes' | 'precios';
  op: 'create' | 'update' | 'delete';
  payload: unknown;       // ya validado con Zod
  estado: 'pendiente' | 'enviado' | 'aplicado' | 'conflicto' | 'rechazado';
  creadoEn: string;       // solo para mostrar
  attempts: number;
  lastError: string | null;
};
```

Reglas:

1. **Idempotencia**: reenviar el mismo `idempotencyKey` no crea otra fila. El servidor hace `upsert`
   por esa clave.
2. **Orden**: se envía y aplica en orden `(lamport, deviceId)`; `creadoEn` es solo para mostrar. Un
   `failed` no bloquea a los demás si son de otra entidad.
3. **Reintento**: backoff exponencial con tope; **4xx de validación no se reintenta** (pasa a `failed`
   con motivo visible). 5xx y red sí.
4. **No se descarta en silencio**: `failed` se muestra con un botón "reintentar" y "exportar".
5. **Tope**: si el outbox supera ~500 items, se avisa y se sugiere sincronizar; no se borra nada.

## Conflictos: dos clases, dos soluciones

| Clase | Ejemplo | Solución |
|---|---|---|
| **Evento** (append-only) | ración servida, movimiento, compra | No hay conflicto: se suman. Los ids de cliente evitan duplicados. |
| **Maestro editable** | receta, precio de insumo, menú | **Gana el cierre válido más antiguo** por `(lamport, device_id)` (D5); el otro queda como conflicto visible con "cambió en otro dispositivo". |

Prohibido resolver un evento con "el último gana": si dos teléfonos registran 40 y 35 raciones, la
respuesta correcta es 75 (o una revisión humana).

## Service worker

| Recurso | Estrategia |
|---|---|
| App shell (HTML, JS, CSS, fuentes) | precache, `CacheFirst` con actualización en segundo plano |
| Datos de API (GET) | `NetworkFirst` con timeout corto; sin red, se lee IndexedDB |
| POST/PATCH | **nunca** se cachean: van por outbox |
| Imágenes de recetas | `StaleWhileRevalidate` con límite de entradas |

Actualización: el SW nuevo **no** toma control a la fuerza. Se muestra "hay una versión nueva,
recargar" y se aplica cuando la persona acepta (no en medio de una carga de raciones).

## Límites reales del navegador

- **iOS/Safari no tiene Background Sync.** El flush ocurre al abrir, al volver a la pestaña
  (`visibilitychange`) y con un botón manual. No prometas sincronización "en segundo plano" en iPhone.
- El SO puede desalojar el almacenamiento: por eso el respaldo exportable y el aviso de cuota.
- `navigator.onLine` miente: la fuente de verdad es el resultado del request, no el flag.

## Qué se testea

1. Registrar con la red apagada (`context.setOffline(true)`) → el dato aparece y el badge dice pendiente.
2. Volver online → se envía **una** vez (contar filas, no confiar en el toast).
3. Reintentar tras un 500 simulado → no duplica.
4. Un 400 de validación → `failed`, visible, con motivo.
5. Dos "dispositivos" (`fake-indexeddb` + adaptador en memoria) editan el mismo campo → aviso y valor
   remoto.
6. Recargar la app sin red → arranca y muestra lo último guardado.

## Anti-patrones

- `localStorage` para datos de negocio (sin transacciones, 5 MB, se borra fácil).
- Sincronizar "todo" en cada arranque: se hace pull incremental con cursor.
- Resolver todo con "el último gana".
- Un `toast` de "sincronizado" sin verificar la respuesta del servidor.
- Guardar el `olla_id` en el outbox y confiar en él: la autorización la decide el servidor.

## Fuente

- `packages/sync/AGENTS.md` y `docs/contracts/sync.md` (contrato del outbox y del evento).
- `docs/DECISIONES.md` D5 — reloj de Lamport y regla de conflicto.
- `docs/adr/0001-base-monorepo.md` — base del monorepo y la PWA offline.
- MDN: Service Worker, IndexedDB, Background Synchronization (para los límites de Safari).
