# Contrato de sincronización (`/sync/push` y `/sync/pull`)

**Vigente:** sí. Deriva de `docs/DECISIONES.md` D1/D2/D5 y manda sobre
`docs/ARQUITECTURA.md` §5.4 cuando difieren.
**Implementación:** Edge Functions de Supabase (Deno), sin VPS y sin `apps/api`:

- `supabase/functions/sync-push/index.ts`
- `supabase/functions/sync-pull/index.ts`
- `supabase/functions/_shared/sync.ts` (validación común)

El paquete `packages/sync` expone el `SyncPort` equivalente para el cliente.
Las funciones **no usan `service_role`**: reciben el JWT del dispositivo y RLS decide.

---

## 0. Reglas que no se negocian

| Regla | Consecuencia |
|---|---|
| `idempotency_key = event_uuid` | Reenviar el mismo lote no duplica. La base lo refuerza con `unique` + `check`. |
| Lote de **1..100** eventos | `> 100` → `400`, no se procesa nada. |
| Orden `(lamport, device_id)` | El servidor ordena antes de insertar; el pull devuelve en ese orden. **Nunca** `Date.now()` para ordenar. |
| UUIDv7 generado en el cliente | El servidor no inventa ids de eventos. |
| Append-only | Movimientos y raciones no se sobrescriben; un cierre inválido queda como `conflicto`. |
| Identidad | El payload **nunca** incluye `nombreLocal` ni `alias` (`localOnly: true`). |

---

## 1. `POST /sync/push`

### Request

```http
POST /functions/v1/sync-push
Authorization: Bearer <jwt del dispositivo>
Content-Type: application/json

{
  "eventos": [
    {
      "eventUuid": "018f2c8e-7d1a-7c3e-9b5f-2a4c6e8f0a1b",
      "idempotencyKey": "018f2c8e-7d1a-7c3e-9b5f-2a4c6e8f0a1b",
      "lamport": 42,
      "deviceId": "dev_7f3a",
      "ollaId": "00000000-0000-4000-8000-000000000001",
      "entidad": "movimientos",
      "op": "upsert",
      "payload": { "id": "…", "insumoId": "arroz", "delta": -2000, "motivo": "salida" },
      "creadoEn": "2026-11-23T10:00:00Z"
    }
  ]
}
```

### Validación (antes de tocar la base)

1. `Authorization: Bearer` presente (si no, `401`).
2. `eventos` es un arreglo de 1 a 100.
3. `eventUuid` e `idempotencyKey` son UUID y son **iguales**.
4. `lamport` entero `>= 0`; `deviceId` y `ollaId` no vacíos.
5. `entidad ∈ personas | raciones | movimientos | solicitudes | precios | menus`.
6. `op ∈ upsert | delete`; `creadoEn` presente.

Si el lote entero es inválido → `400` con `rechazados[]`. Los eventos válidos se
ordenan por `(lamport, deviceId)` y se insertan con
`upsert(..., onConflict: 'idempotency_key', ignoreDuplicates: true)`.

### Response `200`

```json
{
  "aceptados": ["018f2c8e-…"],
  "duplicados": [],
  "rechazados": [],
  "pendientes": 3
}
```

| Campo | Significado |
|---|---|
| `aceptados` | Claves insertadas en este request. |
| `duplicados` | Claves que ya existían (idempotencia; no es error). |
| `rechazados` | Eventos inválidos del lote (`400`), con `motivo`. |
| `pendientes` | Eventos de las ollas del caller con `estado = 'pendiente'`. |

### Errores

| Código | Cuándo |
|---|---|
| `400` | Lote inválido, JSON inválido, RLS/insert rechazado. |
| `401` | Sin JWT. |
| `405` | Método distinto de `POST`. |
| `500` | Falta `SUPABASE_URL` o `SUPABASE_ANON_KEY`. |

---

## 2. `GET /sync/pull`

```http
GET /functions/v1/sync-pull?since=42&since_device=dev_7f3a&limit=500
Authorization: Bearer <jwt del dispositivo>
```

- `since`: lamport del último evento aplicado (default `0`).
- `since_device`: opcional; desempata el mismo lamport.
- `limit`: 1..500 (default 500).

Devuelve eventos con `(lamport, device_id) > (since, since_device)`, ordenados por
`(lamport, device_id)`:

```json
{
  "eventos": [
    {
      "eventUuid": "…",
      "idempotencyKey": "…",
      "lamport": 43,
      "deviceId": "dev_7f3a",
      "ollaId": "…",
      "entidad": "movimientos",
      "payload": {},
      "estado": "pendiente",
      "creadoEn": "2026-11-23T10:05:00Z"
    }
  ],
  "cursor": { "lamport": 43, "deviceId": "dev_7f3a" }
}
```

El cliente guarda `cursor` y lo manda como `since`/`since_device` en la próxima
llamada. Sin `since_device`, la paginación por lamport puede repetir filas del
mismo lamport: es seguro porque el cliente aplica por `eventUuid`.

---

## 3. Modelo en la base

Tabla `evento_sync` (`supabase/migrations/20261123150000_modelo_base.sql`):

| Columna | Tipo | Nota |
|---|---|---|
| `event_uuid` | `uuid` PK | Generado en el cliente (UUIDv7). |
| `idempotency_key` | `uuid` unique | `check (idempotency_key = event_uuid)`. |
| `lamport` | `bigint` | `>= 0`. |
| `device_id` | `text` | Desempate del orden. |
| `olla_id` | `uuid` | Tenencia; RLS por `app.mis_ollas()`. |
| `entidad` | `text` | Enum del dominio sync. |
| `payload` | `jsonb` | Cuerpo del evento; sin identidad local. |
| `estado` | `text` | `pendiente → enviado → aplicado \| conflicto \| rechazado`. |
| `creado_en` / `recibido_en` | `timestamptz` | Reloj del cliente (solo mostrar) / servidor. |

Índice: `evento_sync (lamport, device_id)`.

RLS: `select` e `insert` para `authenticated` **solo** de las ollas del caller.
No hay policy de `update`/`delete`: los eventos no se reescriben desde el cliente.

---

## 4. Qué NO hace este contrato

- No materializa los eventos sobre `personas`/`movimientos` (eso es el worker de M5).
- No cifra: el cifrado local AES-GCM derivado del PIN es del dispositivo (D5).
- No resuelve conflictos: los expone como `estado = 'conflicto'` para revisión.
- No incluye identidad: si un payload trae `nombreLocal`, es un bug del cliente.

## 5. Verificación

```bash
pnpm -r typecheck   # el cliente y packages/sync
pnpm -r test        # orden de lote y límite de 100 en packages/sync
# Edge Functions (Deno, no entran en tsc):
supabase functions serve sync-push
curl -X POST http://localhost:54321/functions/v1/sync-push \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d @lote.json
```
