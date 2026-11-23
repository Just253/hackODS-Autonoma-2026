-- Catalogo de productos y precio observado por producto (#63, D8).
--
-- Antes de este archivo la serie de precios era `precios`: una fila por insumo de la
-- olla (y el pollo no existia). Este archivo trae el modelo del contrato
-- (`docs/contracts/comprobantes.md` §2.3-2.5, `packages/contracts/src/finanzas.ts`):
--
--   * `producto_catalogo`   global (sin olla): lectura para todo autenticado, nadie
--                           escribe desde el cliente (la ingesta es otro issue).
--   * `producto_alias`      alias global (olla_id null) o de una olla. Solo lectura.
--   * `precio_observado`    inmutable, append-only, por olla: la olla ve SOLO sus
--                           observaciones (la serie se agrega con `fn_reporte_red`,
--                           k >= 10; ver comprobantes.md:906). Sin INSERT de cliente.
--
-- Decisiones de implementacion:
--
-- 1. Nombre `producto_catalogo` y no `productos`: el contrato, los tipos Zod y el
--    modelo del D8 usan `producto_catalogo`; desviarse obliga a mapear en cada capa.
-- 2. `precios` NO se toca. La pantalla de precios la usa hoy (fixture); este issue
--    agrega la serie por producto en paralelo. Retirarla es otro issue.
-- 3. `id` del catalogo es uuid (contrato) con UUIDv5 determinista desde el `slug`
--    en el seed, asi `id` y `slug` son estables y el seed es idempotente.
-- 4. `lamport`/`device_id`: el contrato los marca obligatorios en `precio_observado`;
--    se exigen aqui. Nota de contrato: en `producto_catalogo` no existen (es
--    global, no viaja por el outbox).
-- 5. Todo `text` con lista cerrada lleva CHECK con los valores del schema Zod
--    (`categoriaProductoSchema`, `canalObservadoSchema`, ...). Los grants de este
--    stack dan `arwdDxt` por default: se revoca y se re-otorga SOLO lecturas.
--
-- RLS (default-deny):
--   * producto_catalogo / producto_alias: select a `authenticated`; sin insert/update.
--   * precio_observado: select filtrado por `olla_id in app.mis_ollas()`;
--     sin insert/update/delete (ingesta = otro issue; inmutable por diseno).

-- ---------------------------------------------------------------------------
-- producto_catalogo (global)
-- ---------------------------------------------------------------------------

create table if not exists public.producto_catalogo (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  nombre text not null check (nombre <> ''),
  categoria text not null check (categoria in (
    'abarrotes', 'verduras', 'frutas', 'carnes', 'lacteos', 'bebidas', 'limpieza', 'otros'
  )),
  subcategoria text,
  unidad_base text not null check (unidad_base in ('g', 'ml', 'unidad')),
  perecedero boolean not null,
  peso_variable boolean not null default false,
  -- Guardas de cordura en microcentesimos por unidad base (1 = 10^-6 centimo).
  rango_precio_min_microcent bigint check (rango_precio_min_microcent is null
                                           or rango_precio_min_microcent >= 0),
  rango_precio_max_microcent bigint check (rango_precio_max_microcent is null
                                           or rango_precio_max_microcent >= 0),
  -- Guardas de cantidad por linea, en milesimas de unidad base.
  cantidad_min_linea_milesimas bigint check (cantidad_min_linea_milesimas is null
                                             or cantidad_min_linea_milesimas >= 0),
  cantidad_max_linea_milesimas bigint check (cantidad_max_linea_milesimas is null
                                             or cantidad_max_linea_milesimas >= 0),
  activo boolean not null default true,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint producto_catalogo_rango_orden check (
    rango_precio_min_microcent is null
    or rango_precio_max_microcent is null
    or rango_precio_min_microcent <= rango_precio_max_microcent
  ),
  constraint producto_catalogo_cantidad_orden check (
    cantidad_min_linea_milesimas is null
    or cantidad_max_linea_milesimas is null
    or cantidad_min_linea_milesimas <= cantidad_max_linea_milesimas
  )
);

drop trigger if exists producto_catalogo_touch on public.producto_catalogo;
create trigger producto_catalogo_touch before update on public.producto_catalogo
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- producto_alias (global o por olla)
-- ---------------------------------------------------------------------------

create table if not exists public.producto_alias (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.producto_catalogo on delete cascade,
  -- null = alias global aprobado por admin; con valor = alias de esa olla.
  olla_id uuid references public.ollas on delete cascade,
  texto text not null check (texto <> ''),
  -- Minusculas, sin tildes, sin puntuacion, unidades expandidas.
  texto_norm text not null check (texto_norm <> ''),
  estado text not null default 'propuesto'
    check (estado in ('propuesto', 'aprobado', 'rechazado')),
  origen text not null check (origen in ('humano', 'modelo', 'importacion')),
  aprobado_por_ref text,
  aprobado_en timestamptz,
  veces_usado integer not null default 0 check (veces_usado >= 0),
  ultima_vez timestamptz,
  -- Contrato §2.4: obligatorios si `aprobado`.
  constraint producto_alias_aprobado_meta check (
    estado <> 'aprobado'
    or (aprobado_por_ref is not null and aprobado_en is not null)
  )
);

-- Un texto normalizado por producto y ambito (global cuenta como un ambito propio).
create unique index if not exists producto_alias_texto_uk
  on public.producto_alias (producto_id, coalesce(olla_id, '00000000-0000-0000-0000-000000000000'), texto_norm);

-- ---------------------------------------------------------------------------
-- precio_observado (inmutable, append-only, por olla)
-- ---------------------------------------------------------------------------

create table if not exists public.precio_observado (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references public.ollas on delete cascade,
  producto_id uuid not null references public.producto_catalogo on delete restrict,
  comprobante_item_id uuid,
  fecha date not null,
  canal text not null check (canal in ('mayorista', 'minorista', 'no_declarado')),
  unidad_base text not null check (unidad_base in ('g', 'ml', 'unidad')),
  cantidad_milesimas bigint not null check (cantidad_milesimas > 0),
  precio_microcent_por_base bigint not null check (precio_microcent_por_base >= 0),
  moneda text not null check (moneda ~ '^[A-Z]{3}$'),
  -- Obligatorio si la moneda no es PEN (§2.5).
  precio_pen_microcent_por_base bigint
    check (precio_pen_microcent_por_base is null or precio_pen_microcent_por_base >= 0),
  proveedor_ref uuid,
  zona_id uuid,
  origen text not null check (origen in ('compra', 'encuesta', 'donacion_valorizada', 'declarado')),
  calidad_evidencia text not null default 'papel' check (calidad_evidencia in ('papel', 'declarado')),
  estado text not null default 'valido' check (estado in ('valido', 'sospechoso', 'excluido')),
  motivo_exclusion text,
  reemplaza_a_id uuid references public.precio_observado on delete set null,
  -- Sin updated_at: no se edita. Corregir = nueva fila que reemplaza.
  created_at timestamptz not null default now(),
  lamport bigint not null default 0 check (lamport >= 0),
  device_id text not null check (device_id <> ''),
  constraint precio_observado_moneda_pen check (
    moneda = 'PEN' or precio_pen_microcent_por_base is not null
  ),
  constraint precio_observado_exclusion_motivo check (
    estado <> 'excluido' or motivo_exclusion is not null
  ),
  constraint precio_observado_reemplazo_self check (reemplaza_a_id is distinct from id)
);

-- Una linea produce como maximo una observacion valida (§2.5).
create unique index if not exists precio_observado_item_valido_uk
  on public.precio_observado (comprobante_item_id)
  where estado = 'valido' and comprobante_item_id is not null;

-- La serie se consulta por producto (y la olla filtra por RLS).
create index if not exists precio_observado_serie_idx
  on public.precio_observado (producto_id, unidad_base, canal, fecha);

create index if not exists precio_observado_olla_fecha_idx
  on public.precio_observado (olla_id, fecha);

-- ---------------------------------------------------------------------------
-- RLS y grants
-- ---------------------------------------------------------------------------

alter table public.producto_catalogo enable row level security;
alter table public.producto_alias enable row level security;
alter table public.precio_observado enable row level security;

-- Catalogo global: lo lee todo autenticado; nadie escribe desde el cliente.
create policy producto_catalogo_select on public.producto_catalogo
  for select to authenticated using (true);

create policy producto_alias_select on public.producto_alias
  for select to authenticated using (true);

-- Serie por olla: solo la olla que la observo. El agregado de red es RPC
-- `security definer` con k >= 10, no un select crudo (comprobantes.md:906).
create policy precio_observado_select on public.precio_observado
  for select to authenticated
  using (olla_id in (select app.mis_ollas()));

-- Los default privileges de este stack dan arwdDxt a anon/authenticated. Se
-- revoca todo y se concede SOLO select: sin INSERT de cliente (ingesta = otro
-- issue), sin UPDATE/DELETE (inmutable) y sin TRUNCATE (DELETE encubierto).
revoke all on table public.producto_catalogo  from anon, authenticated;
revoke all on table public.producto_alias     from anon, authenticated;
revoke all on table public.precio_observado   from anon, authenticated;

grant usage on schema app to authenticated;

grant select on table public.producto_catalogo to authenticated;
grant select on table public.producto_alias    to authenticated;
grant select on table public.precio_observado  to authenticated;

comment on table public.producto_catalogo is
  'Catalogo global de productos (D8). Sin olla_id: lo lee todo autenticado, escribe solo el servidor.';
comment on table public.producto_alias is
  'Alias de producto: olla_id null = global. Solo lo aprueba una persona (D8); lectura de cliente.';
comment on table public.precio_observado is
  'Serie inmutable: una observacion por compra (olla, producto, canal, fecha). La olla ve solo lo suyo; el agregado de red es RPC k>=10.';
comment on column public.precio_observado.precio_microcent_por_base is
  'Microcentesimos por unidad base (1 = 10^-6 centimo); precio final pagado con IGV.';
