-- Zonas, precios por zona y admin global (#92, ADR-0013).
--
-- `ollas` solo tenia `distrito` (texto libre): dos ollas del mismo cono no
-- compartian nada y cada una re-sembraba su propia serie de precios. Acá entra la
-- unidad operativa de la red:
--
--   * `zonas`: 3 filas fijas (lima-sur, lima-este, lima-norte) con sus distritos.
--   * `ollas.zona_id`: FK nullable al añadir; se rellena por `distrito`; queda
--     `not null` solo si el backfill deja todas las ollas del momento con zona.
--   * `precios_zona`: la serie compartida por zona. Es server-side (la alimenta la
--     ingesta, no el cliente) y la lee cualquier miembro de una olla de la zona.
--   * `app.es_admin_global()`: el `admin` de una olla cualquiera opera la red
--     entera; `app.mis_ollas()` respeta eso devolviendo todas las ollas.
--
-- Semantica del dinero: `precios_zona.precio` es bigint en microcentesimos por
-- unidad base, igual que `precios.precio` desde 20261123180000 (ADR-0004).

-- ---------------------------------------------------------------------------
-- Zonas
-- ---------------------------------------------------------------------------
create table if not exists public.zonas (
  id text primary key,
  nombre text not null,
  -- Distritos cubiertos. `null` = la zona no declara lista (no es "sin distritos").
  distritos text[]
);

insert into public.zonas (id, nombre, distritos) values
  ('lima-sur',  'Lima Sur',  array['Villa El Salvador', 'Villa Maria del Triunfo', 'Lurin', 'Pachacamac']),
  ('lima-este', 'Lima Este', array['Ate', 'San Juan de Lurigancho']),
  ('lima-norte','Lima Norte',array['Comas', 'Independencia'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ollas.zona_id: nullable al añadir, backfill por distrito, `not null` si cubre todo.
-- ---------------------------------------------------------------------------
alter table public.ollas
  add column if not exists zona_id text references public.zonas (id);

-- Backfill sin distinguir tildes ni mayusculas (el seed escribe distritos sin
-- tilde; una olla real puede tenerlas) y solo para las que aun no tienen zona.
update public.ollas o
set zona_id = z.id
from public.zonas z
where o.zona_id is null
  and z.distritos is not null
  and translate(lower(o.distrito), 'áéíóú', 'aeiou') = any (
        select translate(lower(d), 'áéíóú', 'aeiou') from unnest(z.distritos) as d
      );

-- `not null` solo si el backfill dejo todas las ollas con zona Y hay al menos
-- una. En una base vacia no se pone aqui: el seed local crea las ollas DESPUES
-- de esta migracion y las rellena el seed de la demo.
do $$
begin
  if (select count(*) from public.ollas) > 0
     and not exists (select 1 from public.ollas where zona_id is null) then
    alter table public.ollas alter column zona_id set not null;
  end if;
end $$;

create index if not exists ollas_zona_idx on public.ollas (zona_id);

-- ---------------------------------------------------------------------------
-- precios_zona: la serie compartida. Una fila por (zona, insumo, canal, fecha).
-- ---------------------------------------------------------------------------
create table if not exists public.precios_zona (
  id uuid primary key default gen_random_uuid(),
  zona_id text not null references public.zonas (id) on delete cascade,
  insumo_id text not null references public.insumos (id) on delete cascade,
  canal text not null check (canal in ('mayorista', 'minorista')),
  unidad text not null check (unidad in ('g', 'ml', 'unidad')),
  -- Microcentesimos por unidad base (1 = 10^-6 centimo), como `precios.precio`.
  precio bigint not null check (precio >= 0),
  fecha date not null,
  fuente text not null,
  unique (zona_id, insumo_id, canal, fecha)
);

create index if not exists precios_zona_serie_idx
  on public.precios_zona (zona_id, insumo_id, canal, fecha);

-- ---------------------------------------------------------------------------
-- Admin global y `app.mis_ollas()`
-- ---------------------------------------------------------------------------

-- `admin` en CUALQUIER olla => admin de la red. `security definer` con
-- `search_path` fijo: la consulta `devices -> olla_members` la hacen las policies
-- como `authenticated`, que no lee esas tablas fuera de lo suyo.
create or replace function app.es_admin_global()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from devices d
    join olla_members om on om.member_id = d.member_id
    where d.user_id = auth.uid()
      and d.revoked_at is null
      and om.rol = 'admin'
  );
$$;

-- Mismo contrato de antes salvo la primera rama: el admin global ve todas las
-- ollas. Los demas siguen viendo solo las suyas y `revoked_at` se respeta en las
-- dos ramas (si el device del admin esta revocado, `es_admin_global()` da false).
create or replace function app.mis_ollas()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from ollas o
  where app.es_admin_global()
  union
  select om.olla_id
  from devices d
  join olla_members om on om.member_id = d.member_id
  where d.user_id = auth.uid() and d.revoked_at is null;
$$;

-- ---------------------------------------------------------------------------
-- RLS y grants
-- ---------------------------------------------------------------------------
alter table public.zonas enable row level security;
alter table public.precios_zona enable row level security;

-- Las zonas son catalogo de lectura para cualquier autenticado: las consume la
-- pantalla de precios junto al nombre de la olla.
create policy zonas_select on public.zonas
  for select to authenticated using (true);

-- La serie de una zona la lee quien tenga una olla en esa zona, o el admin
-- global (que opera la red). Nada de INSERT: la ingesta de precios de zona es
-- server-side, igual que `precio_observado`.
create policy precios_zona_select on public.precios_zona
  for select to authenticated
  using (
    app.es_admin_global()
    or zona_id in (
      select o.zona_id from ollas o where o.id in (select app.mis_ollas())
    )
  );

-- Los default privileges de este stack dan arwdDxt a anon/authenticated: se
-- revoca todo y se concede solo SELECT (sin UPDATE/DELETE/TRUNCATE).
revoke all on table public.zonas        from anon, authenticated;
revoke all on table public.precios_zona from anon, authenticated;

grant usage on schema app to authenticated;

grant select on table public.zonas        to authenticated;
grant select on table public.precios_zona to authenticated;

revoke execute on function app.es_admin_global() from public;
grant execute on function app.es_admin_global() to authenticated;

comment on table public.zonas is
  'Zonas operativas de la red (#92): agrupan ollas por distrito y comparten la serie de precios.';
comment on table public.precios_zona is
  'Serie de precios por zona (#92): server-side, una fila por (zona, insumo, canal, fecha). La lee la zona o el admin global.';
comment on column public.precios_zona.precio is
  'Microcentesimos por unidad base (1 = 10^-6 centimo), igual que precios.precio.';
comment on column public.ollas.zona_id is
  'Zona operativa de la olla (#92). Backfill por distrito; not null si todas las ollas tienen zona.';
comment on function app.es_admin_global() is
  'true si el auth.uid() actual es admin en alguna olla (admin global de la red, #92).';

-- `mi_rol` no cambia: el rol sigue siendo por olla. Las policies que piden
-- `rol in (..., 'admin')` en una olla concreta siguen aislando al admin global a
-- esa olla; lo que la 220000 abre es la LECTURA de la red (`mis_ollas`, zonas y
-- precios_zona), que es lo que #92 necesita.
