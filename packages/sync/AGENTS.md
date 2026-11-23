# AGENTS.md — `packages/sync`

Sincronización offline: ids, versiones, outbox y conflictos. TypeScript puro, determinista, sin UI y
sin red propia (la red entra por una función inyectada).

## Qué es de este paquete

- Generación de ids de cliente (UUIDv7) y `device_id` estable.
- Modelo del **outbox**: `{ id, entity, entity_id, op, payload, base_version, created_at, attempts, last_error }`.
- Reglas de reintento (backoff, tope, qué errores no se reintentan: 4xx de validación).
- Resolución de conflictos: eventos append-only (no hay conflicto) y maestro editable (LWW por campo
  con `updated_at` + `device_id`, aviso cuando cambió en otro dispositivo).
- Contrato del adaptador remoto (`push(batch)`, `pull(since)`), que `apps/web` implementa con Supabase.

## Qué NO es de este paquete

- Componentes o mensajes de UI (expone estados; la UI decide el texto).
- Cliente Supabase, `fetch`, service worker.
- Reglas de negocio: si un evento es válido lo dice `packages/domain`.

## Comandos

```bash
pnpm --filter @hackods/sync test
pnpm --filter @hackods/sync typecheck
```

## Cómo se testea

- Reloj y azar inyectados: el test no depende de la hora real.
- `fake-indexeddb` para el outbox; el adaptador remoto es un doble en memoria.
- Casos obligatorios: reintento no duplica (misma clave de idempotencia), error 400 sale del outbox
  como `failed`, dos dispositivos editan el mismo campo (gana el último y se avisa), pull con datos
  más nuevos no pisa cambios locales pendientes.

## Reglas locales

1. **Idempotencia primero**: el id del evento lo genera el dispositivo; reenviar el mismo id no crea
   una fila nueva.
2. **Nada de "sync mágico"**: si una operación no se puede aplicar, queda `failed` con motivo y se
   muestra. No se descarta en silencio.
3. **No se borra**: se marca `deleted_at` (tombstone) para que el borrado viaje.
4. **Cambio de contrato = PR aparte** (2 aprobaciones) antes de tocar consumidores.
5. El paquete no conoce el esquema SQL: conoce el contrato. Si la base cambia, cambia el contrato y
   después el adaptador.

## Dueño y revisión

Dueño: **C** (`area:contracts`), porque es la costura entre A y B. Requiere 2 aprobaciones. Un cambio
acá se prueba con la suite de `apps/web` offline antes de mergear.
