---
name: Supabase y RLS
description: Patrones de esquema, políticas RLS, migraciones y seed para un sistema multi-olla. Cargar antes de crear una tabla, una política o una migración.
---

# Supabase y RLS

## Cuándo se carga

- Vas a crear o cambiar una tabla, una vista o una función.
- Hay que escribir o revisar una política RLS.
- Un test de aislamiento falla o no existe.
- Hay que generar una migración o tocar el seed.

## Modelo mental

Un solo Postgres, **muchas ollas**. No hay una base por olla. El aislamiento no lo hace el cliente: lo
hace RLS. Un `olla_id` que llega del cliente es una **petición**, no un permiso.

## Esquema mínimo

```
ollas(id, titulo, codigo, tipo, distrito, creada_en)
members(id, pin_hash, recovery_hash, creado_en)
olla_members(member_id, olla_id, rol, primary key (member_id, olla_id))
devices(user_id, member_id, enrolled_at, revoked_at)
personas(codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia,
         consentimiento_seguimiento, created_at, updated_at, deleted_at, device_id, lamport)
insumos(id, olla_id, denominacion, grupo, unidad_base, stock_minimo, updated_at)
precios(id, olla_id, insumo_id, canal, unidad, precio, fecha, fuente, url)
movimientos(id, olla_id, insumo_id, delta, motivo, autor, at, lamport) -- evento
evento_sync(event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, estado)
```

Reglas: `id` uuid (los eventos usan el id del cliente, UUIDv7), `olla_id` **not null** y con índice,
`created_at`/`updated_at` con `timestamptz default now()`. Nada de `serial` para eventos que nacen
offline. **Ninguna tabla guarda identidad personal**: `personas` solo tiene `codigo_p` (P-XXXX).

## Políticas

Helper único, `security definer`, con `search_path` fijo:

```sql
create or replace function app.mis_ollas()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.olla_id
  from devices d
  join olla_members om on om.member_id = d.member_id
  where d.user_id = auth.uid() and d.revoked_at is null;
$$;
```

Patrón por tabla (las cuatro operaciones, no solo `select`):

```sql
alter table public.jornadas enable row level security;

create policy "jornadas_select" on public.jornadas
  for select using (public.is_member(olla_id));

create policy "jornadas_insert" on public.jornadas
  for insert with check (public.is_member(olla_id));

create policy "jornadas_update" on public.jornadas
  for update using (public.is_member(olla_id))
  with check (public.is_member(olla_id));   -- impide mover el registro a otra olla

create policy "jornadas_delete" on public.jornadas
  for delete using (public.is_member(olla_id));
```

Reglas:

1. **`using (true)` es un hallazgo de seguridad**, no un atajo.
2. El `with check` del `update` repite la condición: sin eso se puede "mover" una fila a otra olla.
3. Las vistas exponen solo columnas necesarias y con `security_invoker = true` (o se documenta por qué
   no).
4. Un rol de solo lectura (`role = 'lectora'`) se resuelve con una función/claim, no con otra política
   que nadie recuerda.

## Migraciones

- `supabase/migrations/YYYYMMDDHHMMSS_slug.sql`, **forward-only**. Una migración aplicada no se edita.
- Un tema por migración. RLS de una tabla entra en la **misma** migración que la tabla.
- Toda migración con datos lleva su plan de vuelta atrás (o se declara irreversible y lo aprueba un
  humano).
- `supabase db diff -f <slug>` para generar; revisar el SQL generado **a mano** antes de commitear: el
  diff a veces inventa `drop`/`create` que pierden datos.

## Seed

- `supabase/seed.sql`, idempotente (`on conflict do nothing` / `do update`).
- Menú demo firmado con hash calculado, movimientos y un evento de sync; sin identidad personal.
- Fechas fijas (`2026-11-23`), no `now()`.
- Datos sintéticos: personas `P-0001..P-0006`. Sin identidad, sin documento, sin teléfono.

## Probar el aislamiento

```sql
-- como usuario de la olla A
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid-user-a>","role":"authenticated"}';
select count(*) from public.jornadas;            -- > 0
select count(*) from public.jornadas
 where olla_id = '<uuid-olla-b>';                -- 0
```

El test tiene que **fallar** si se quita la política. Si pasa igual, no está probando RLS.

## Secretos

- `anon key` puede ir al cliente. `service_role` **no**, nunca, bajo ninguna excusa.
- `service_role` solo en CI o en una edge function concreta, leída de variables de entorno.
- Nada de `.env` en el repo. `.env.example` sí, sin valores reales.

## Anti-patrones

- Filtrar por `olla_id` en el cliente y no en la política.
- `security definer` sin `search_path` (escalada de privilegios).
- Función que consulta la tabla que la política protege → recursión infinita. Se resuelve con helper
  `stable` sobre `members`.
- `grant all` a `anon`.
- Probar RLS "a ojo" en el dashboard: se prueba con SQL y con un usuario de otra olla.

## Fuente

- `supabase/AGENTS.md` y `docs/PROTOCOL.md` §5.
- Documentación de Supabase: Row Level Security, `auth.uid()`, `security definer`, migraciones locales.
- `docs/adr/0003-modelo-multitenant.md` (cuando exista).
