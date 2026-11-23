-- Ingesta: capturas (audio y boleta) con su extraccion, embedding y categoria
-- (issue #83, ADR-0011). Una tabla para la captura, otra para sus lineas, y el
-- bucket privado `capturas` con policies por olla.
--
-- Patron del repo (supabase/AGENTS.md): toda tabla nace con RLS, policy por olla
-- con `app.mis_ollas()`, INSERT por flujo y UPDATE solo de las columnas que un
-- flujo puede tocar. Sin DELETE desde el cliente.
--
-- RLS de `captura` / `captura_item`:
--   * SELECT / INSERT de una olla en `app.mis_ollas()`. El INSERT lo hace la
--     Edge Function con el JWT del usuario (ROL authenticated); la function no
--     usa `service_role` (misma regla que sync-push).
--   * UPDATE por cualquier miembro de la olla: `device_id` es una etiqueta del
--     dispositivo (no `auth.uid()`), asi que no sirve de frontera de dueno; la
--     frontera es la olla, igual que en `precios`/`servicios`. La Edge Function
--     del flujo fija el estado final con el mismo JWT del usuario que sube.
--     Se concede UPDATE solo de columnas de proceso (`estado`, `texto`, `items`,
--     `embedding`, `embedding_modelo`, `categoria`, `confianza`, `error`,
--     `lamport`): `olla_id`, `device_id`, `tipo`, `storage_path` y `creado_en`
--     no se reescriben.
--
-- Forward-only. Timestamp posterior a 20261123192000 (ultima en main).

-- 1. Tabla de capturas -------------------------------------------------------
create table if not exists public.captura (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references public.ollas on delete cascade,
  device_id text not null,
  tipo text not null check (tipo in ('audio', 'boleta')),
  storage_path text not null,
  estado text not null default 'subida'
    check (estado in ('subida', 'transcrita', 'extraida', 'categorizada', 'error')),
  texto text,
  items jsonb,
  embedding extensions.vector(1024),
  embedding_modelo text,
  categoria text,
  confianza numeric(4, 3) check (confianza is null or (confianza >= 0 and confianza <= 1)),
  error text,
  creado_en timestamptz not null default now(),
  lamport bigint not null default 0
);

comment on table public.captura is
  'Una captura (audio dictado o boleta) por fila. El binario vive en Storage `capturas`; aca solo el `storage_path`.';
comment on column public.captura.embedding is
  'Embedding de `texto` (bge-m3, 1024 dim, docs/contracts/ingesta.md). NULL hasta que la Edge Function lo calcule.';
comment on column public.captura.embedding_modelo is
  'Modelo que produjo `embedding`: nunca se comparan vectores de modelos distintos.';
comment on column public.captura.lamport is
  'Contador de orden logico del dispositivo, igual que en las tablas de sync.';

create index if not exists captura_olla_creado_idx
  on public.captura (olla_id, creado_en desc);

-- 2. Lineas de la captura ----------------------------------------------------
create table if not exists public.captura_item (
  captura_id uuid not null references public.captura on delete cascade,
  linea integer not null check (linea > 0),
  texto_crudo text not null,
  cantidad numeric(14, 3) check (cantidad is null or cantidad >= 0),
  unidad text,
  -- El precio unitario es un entero en microcentesimos (1 = 10^-6 centimo por
  -- unidad base). NULL cuando el importe es dudoso: no se inventa dinero (D8).
  precio_unitario_microcent bigint check (
    precio_unitario_microcent is null or precio_unitario_microcent >= 0
  ),
  categoria text,
  confianza numeric(4, 3) check (confianza is null or (confianza >= 0 and confianza <= 1)),
  primary key (captura_id, linea)
);

comment on table public.captura_item is
  'Lineas de una captura: una fila por producto leido o dictado. Importe dudoso -> precio NULL (D8).';

-- 3. RLS de `captura` --------------------------------------------------------
alter table public.captura enable row level security;

create policy captura_select on public.captura for select to authenticated
  using (olla_id in (select app.mis_ollas()));

create policy captura_insert on public.captura for insert to authenticated
  with check (olla_id in (select app.mis_ollas()));

-- UPDATE: cualquier miembro de la olla puede avanzar una captura de su olla
-- (subida -> transcrita -> ... o marcar `error`). `device_id` es una etiqueta
-- del dispositivo, no `auth.uid()` (ver `personas.device_id = 'dev-test-a'`):
-- no se puede usar como frontera de dueno. La frontera real es la olla, igual
-- que en `precios`/`servicios`. Sin DELETE: append-only desde el cliente.
-- Se restringen columnas con grants (RLS filtra filas, no columnas);
-- `olla_id`, `device_id`, `tipo`, `storage_path` y `creado_en` no tienen
-- UPDATE para que una captura no cambie de olla ni de binario.
revoke update on table public.captura from authenticated;
grant update (estado, texto, items, embedding, embedding_modelo, categoria, confianza, error, lamport)
  on table public.captura to authenticated;
revoke delete, truncate on table public.captura from authenticated;

create policy captura_update on public.captura for update to authenticated
  using (olla_id in (select app.mis_ollas()))
  with check (olla_id in (select app.mis_ollas()));

-- 4. RLS de `captura_item` ---------------------------------------------------
alter table public.captura_item enable row level security;

create policy captura_item_select on public.captura_item for select to authenticated
  using (captura_id in (
    select c.id from public.captura c
    where c.olla_id in (select app.mis_ollas())
  ));

create policy captura_item_insert on public.captura_item for insert to authenticated
  with check (captura_id in (
    select c.id from public.captura c
    where c.olla_id in (select app.mis_ollas())
  ));

-- Las lineas de una captura se corrigen en la app (cantidad, unidad, categoria,
-- confianza); el importe dudoso se revisa en la pantalla. Misma frontera de
-- olla que `captura`. `captura_id` y `linea` son la PK y no se editan.
revoke update on table public.captura_item from authenticated;
grant update (texto_crudo, cantidad, unidad, categoria, confianza)
  on table public.captura_item to authenticated;
revoke delete, truncate on table public.captura_item from authenticated;

create policy captura_item_update on public.captura_item for update to authenticated
  using (captura_id in (
    select c.id from public.captura c
    where c.olla_id in (select app.mis_ollas())
  ))
  with check (captura_id in (
    select c.id from public.captura c
    where c.olla_id in (select app.mis_ollas())
  ));

-- 5. Bucket privado `capturas` en Storage ------------------------------------
-- El path es `capturas/<olla_id>/<uuid>.<ext>`: `storage.foldername(name)[1]`
-- es el olla_id. Sin listado publico: solo SELECT/INSERT por el prefijo de la
-- olla. `public = false` fuera de `storage.buckets` deja el bucket sin URL
-- publica; el cliente lo lee con `createSignedUrl` (RLS de SELECT).
insert into storage.buckets (id, name, public)
values ('capturas', 'capturas', false)
on conflict (id) do nothing;

-- Subir: solo bajo una carpeta `olla_id` que sea de `app.mis_ollas()`.
create policy capturas_objetos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'capturas'
    and exists (
      select 1 from app.mis_ollas() as m
      where m::text = (storage.foldername(name))[1]
    )
  );

-- Leer (y firmar): lo mismo por prefijo. Sin policy de DELETE ni de UPDATE.
create policy capturas_objetos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'capturas'
    and exists (
      select 1 from app.mis_ollas() as m
      where m::text = (storage.foldername(name))[1]
    )
  );

grant usage on schema app to authenticated;
