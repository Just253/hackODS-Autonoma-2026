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
ollas(id, nombre, distrito, created_at)
members(olla_id, user_id, role, created_at, primary key (olla_id, user_id))
jornadas(id, olla_id, fecha, menu, created_at, updated_at)
raciones(id, olla_id, jornada_id, cantidad, created_at)          -- evento
movimientos(id, olla_id, tipo, monto, insumo_id, fecha, created_at) -- evento
insumos(id, olla_id, nombre, unidad, precio_centimos, updated_at)   -- maestro
```

Reglas: `id` uuid (los eventos usan el id del cliente, UUIDv7), `olla_id` **not null** y con índice,
`created_at`/`updated_at` con `timestamptz default now()`. Nada de `serial` para eventos que nacen
offline.

## Políticas

Helper único, `security definer`, con `search_path` fijo:

```sql
create or replace function public.is_member(p_olla uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.olla_id = p_olla and m.user_id = auth.uid()
  );
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

- `supabase/seed/seed.sql`, idempotente (`on conflict do nothing` / `do update`).
- 2 ollas, usuarios de prueba, 30 días de jornadas, 5 recetas, un conflicto preparado.
- Fechas relativas a un reloj fijo (`2026-11-01T08:00:00-05:00`), no a `now()`.
- Datos sintéticos: alias (`socia-01`), montos redondos. Sin nombres, DNI ni teléfonos.

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
