-- Modelo base segun docs/DECISIONES.md (manda sobre 02-arquitectura.md).
--
-- Reglas que este archivo respeta:
--   * El servidor NO guarda identidad de personas: solo `codigo_p` (P-XXXX).
--     Sin identidad personal, sin documento, sin telefono, sin direccion.
--   * `olla.tipo` distingue olla comun de comedor PCA.
--   * Precio como serie: canal, unidad, fecha, fuente y url.
--   * Despensa append-only: `movimientos` no tiene saldo mutable.
--   * `evento_sync` es el transporte idempotente del outbox.
--   * Toda tabla nace con RLS (default-deny).
--
-- La migracion 20261123120000_init.sql queda como marcador vacio: nunca se aplico.

create extension if not exists pgcrypto;

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Tenencia y dispositivos
-- ---------------------------------------------------------------------------

create table if not exists ollas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  codigo text not null unique check (codigo ~ '^[A-HJ-NP-Z2-9]{6}$'),
  tipo text not null default 'comun' check (tipo in ('comun', 'comedor_pca')),
  distrito text,
  creada_en timestamptz not null default now()
);

-- El equipo operativo se identifica por hash de PIN, no por identidad personal.
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  pin_hash text not null,
  recovery_hash text not null,
  creado_en timestamptz not null default now()
);

create table if not exists olla_members (
  member_id uuid not null references members on delete cascade,
  olla_id uuid not null references ollas on delete cascade,
  rol text not null check (rol in ('organizadora', 'cocinera', 'nutricionista', 'admin')),
  primary key (member_id, olla_id)
);

create table if not exists devices (
  user_id uuid primary key,
  member_id uuid not null references members on delete cascade,
  enrolled_at timestamptz not null default now(),
  last_seen timestamptz,
  revoked_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Personas: solo codigo P-XXXX. La identidad local vive en el dispositivo.
-- ---------------------------------------------------------------------------

create table if not exists personas (
  codigo_p text primary key check (codigo_p ~ '^P-[A-Z0-9]{4}$'),
  olla_id uuid not null references ollas on delete cascade,
  anio_nacimiento integer not null check (anio_nacimiento between 1900 and 2100),
  sexo text not null check (sexo in ('F', 'M', 'X')),
  categoria text not null
    check (categoria in ('adulto', 'adulto_mayor', 'nino', 'gestante', 'lactante')),
  anemia text not null default 'sin_dato'
    check (anemia in ('si', 'no', 'sin_dato')),
  -- Datos de salud opcionales y sensibles: solo con consentimiento (Ley 29733).
  peso_kg numeric(6, 2) check (peso_kg is null or peso_kg > 0),
  talla_cm numeric(5, 2) check (talla_cm is null or talla_cm > 0),
  consentimiento_seguimiento boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text not null,
  lamport bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- Catalogo, precios y menus
-- ---------------------------------------------------------------------------

create table if not exists insumos (
  id text primary key,
  olla_id uuid not null references ollas on delete cascade,
  denominacion text not null,
  grupo text not null,
  unidad_base text not null check (unidad_base in ('g', 'ml', 'unidad')),
  gramos_por_unidad numeric(10, 2) check (gramos_por_unidad is null or gramos_por_unidad > 0),
  stock_minimo numeric(10, 2) not null default 0 check (stock_minimo >= 0),
  perecedero boolean not null default true,
  alergenos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text not null,
  lamport bigint not null default 0
);

-- Serie de precios: sin fecha, canal y fuente no sirve para costo ni brecha.
create table if not exists precios (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  insumo_id text not null references insumos on delete cascade,
  canal text not null check (canal in ('mayorista', 'minorista')),
  unidad text not null,
  precio numeric(12, 2) not null check (precio >= 0),
  fecha date not null,
  fuente text not null,
  url text,
  created_at timestamptz not null default now()
);

create table if not exists menu_template (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  perfil text not null check (perfil in ('general', 'especial')),
  opcion text not null check (opcion in ('A', 'B')),
  estado text not null default 'borrador'
    check (estado in ('borrador', 'en_revision', 'aprobado', 'publicado', 'retirado')),
  sello_nutricionista text,
  sello_cnp text,
  sello_fecha timestamptz,
  version integer not null default 1 check (version >= 1),
  hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_day (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  template_id uuid not null references menu_template on delete cascade,
  dia_semana integer not null check (dia_semana between 1 and 7),
  fecha date,
  version integer not null default 1 check (version >= 1),
  hash text not null
);

create table if not exists dish (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  menu_day_id uuid not null references menu_day on delete cascade,
  momento text not null check (momento in ('almuerzo', 'cena')),
  titulo text not null,
  version integer not null default 1 check (version >= 1),
  hash text not null
);

create table if not exists ingredient (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  dish_id uuid not null references dish on delete cascade,
  insumo_id text not null references insumos on delete cascade,
  gramos numeric(10, 2) check (gramos is null or gramos >= 0),
  unidad text not null,
  version integer not null default 1 check (version >= 1),
  hash text not null
);

create table if not exists portion (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  dish_id uuid not null references dish on delete cascade,
  grupo text not null
    check (grupo in ('menor_6m', 'lactante_6_23m', 'menor_5', 'escolar', 'adolescente',
                     'adulto', 'adulto_mayor', 'gestante', 'lactante_materna')),
  cantidad numeric(10, 2) not null check (cantidad > 0),
  unidad text not null,
  version integer not null default 1 check (version >= 1),
  hash text not null
);

-- `constraint` es palabra reservada en PostgreSQL: la tabla se llama menu_constraint.
-- En el dominio es `constraint` (docs/DECISIONES.md D4).
create table if not exists menu_constraint (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  template_id uuid not null references menu_template on delete cascade,
  tipo text not null check (tipo in ('alergia', 'dieta', 'frecuencia', 'inocuidad', 'otro')),
  valor text not null,
  motivo text,
  version integer not null default 1 check (version >= 1),
  hash text not null
);

create table if not exists substitution (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  template_id uuid not null references menu_template on delete cascade,
  insumo_origen_id text not null references insumos on delete cascade,
  insumo_destino_id text not null references insumos on delete cascade,
  factor numeric(10, 4) not null check (factor > 0),
  aprobada_por text not null,
  version integer not null default 1 check (version >= 1),
  hash text not null
);

create table if not exists validation (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  template_id uuid not null references menu_template on delete cascade,
  estado text not null check (estado in ('aprobado', 'rechazado')),
  hallazgos text[] not null default '{}',
  validador text not null,
  cnp text not null,
  fecha timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  hash text not null
);

-- ---------------------------------------------------------------------------
-- Operacion: despensa append-only, servicios y solicitudes
-- ---------------------------------------------------------------------------

create table if not exists movimientos (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  insumo_id text not null references insumos on delete cascade,
  delta numeric(12, 2) not null check (delta <> 0),
  motivo text not null check (motivo in ('entrada', 'salida', 'merma', 'ajuste', 'transferencia')),
  autor text not null,
  at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text not null,
  lamport bigint not null default 0
);

create table if not exists servicios (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references ollas on delete cascade,
  fecha date not null,
  tipo text not null check (tipo in ('desayuno', 'almuerzo', 'cena', 'refaccion', 'unico')),
  menu_day_id uuid references menu_day on delete set null,
  -- 75 C es checklist de inocuidad, no un calculo.
  cocido_a_75c boolean not null default false,
  inocuidad_verificada_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text not null,
  lamport bigint not null default 0
);

create table if not exists solicitudes (
  id uuid primary key default gen_random_uuid(),
  olla_origen_id uuid not null references ollas on delete cascade,
  olla_destino_id uuid not null references ollas on delete cascade,
  estado text not null default 'borrador'
    check (estado in ('borrador', 'enviada', 'aceptada', 'entregada', 'cancelada')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  device_id text not null,
  lamport bigint not null default 0
);

create table if not exists solicitud_items (
  solicitud_id uuid not null references solicitudes on delete cascade,
  insumo_id text not null references insumos on delete cascade,
  cantidad numeric(10, 2) not null check (cantidad > 0),
  unidad text not null,
  nota text,
  primary key (solicitud_id, insumo_id)
);

-- ---------------------------------------------------------------------------
-- Sync: el outbox viaja como eventos idempotentes
-- ---------------------------------------------------------------------------

create table if not exists evento_sync (
  event_uuid uuid primary key,
  idempotency_key uuid not null unique,
  lamport bigint not null check (lamport >= 0),
  device_id text not null,
  olla_id uuid not null references ollas on delete cascade,
  entidad text not null
    check (entidad in ('personas', 'raciones', 'movimientos', 'solicitudes', 'precios', 'menus')),
  payload jsonb not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'aplicado', 'conflicto', 'rechazado')),
  creado_en timestamptz not null,
  recibido_en timestamptz not null default now(),
  constraint evento_sync_idempotencia check (idempotency_key = event_uuid)
);

create index if not exists evento_sync_orden_idx on evento_sync (lamport, device_id);

-- ---------------------------------------------------------------------------
-- updated_at por trigger (el reloj del cliente no ordena: solo muestra)
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists personas_touch on personas;
create trigger personas_touch before update on personas
  for each row execute function app.touch_updated_at();

drop trigger if exists movimientos_touch on movimientos;
create trigger movimientos_touch before update on movimientos
  for each row execute function app.touch_updated_at();

drop trigger if exists solicitudes_touch on solicitudes;
create trigger solicitudes_touch before update on solicitudes
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: default-deny. Sin policy no hay acceso.
-- ---------------------------------------------------------------------------

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

create or replace function app.mi_rol(p_olla_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select om.rol
  from devices d
  join olla_members om on om.member_id = d.member_id
  where d.user_id = auth.uid() and d.revoked_at is null and om.olla_id = p_olla_id
  limit 1;
$$;

alter table ollas enable row level security;
alter table members enable row level security;
alter table olla_members enable row level security;
alter table devices enable row level security;
alter table personas enable row level security;
alter table insumos enable row level security;
alter table precios enable row level security;
alter table menu_template enable row level security;
alter table menu_day enable row level security;
alter table dish enable row level security;
alter table ingredient enable row level security;
alter table portion enable row level security;
alter table menu_constraint enable row level security;
alter table substitution enable row level security;
alter table validation enable row level security;
alter table movimientos enable row level security;
alter table servicios enable row level security;
alter table solicitudes enable row level security;
alter table solicitud_items enable row level security;
alter table evento_sync enable row level security;

create policy ollas_select on ollas for select to authenticated
  using (id in (select app.mis_ollas()));

create policy members_select on members for select to authenticated
  using (id in (select d.member_id from devices d where d.user_id = auth.uid()));

create policy olla_members_select on olla_members for select to authenticated
  using (olla_id in (select app.mis_ollas()));

create policy devices_select on devices for select to authenticated
  using (user_id = auth.uid());

-- Lectura por olla; escritura de personas solo organizadora/admin.
create policy personas_select on personas for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy personas_insert on personas for insert to authenticated
  with check (olla_id in (select app.mis_ollas())
              and app.mi_rol(olla_id) in ('organizadora', 'admin'));

create policy insumos_select on insumos for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy precios_select on precios for select to authenticated
  using (olla_id in (select app.mis_ollas()));

create policy menu_template_select on menu_template for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy menu_day_select on menu_day for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy dish_select on dish for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy ingredient_select on ingredient for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy portion_select on portion for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy menu_constraint_select on menu_constraint for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy substitution_select on substitution for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy validation_select on validation for select to authenticated
  using (olla_id in (select app.mis_ollas()));

create policy movimientos_select on movimientos for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy movimientos_insert on movimientos for insert to authenticated
  with check (olla_id in (select app.mis_ollas()));

create policy servicios_select on servicios for select to authenticated
  using (olla_id in (select app.mis_ollas()));

create policy solicitudes_select on solicitudes for select to authenticated
  using (olla_origen_id in (select app.mis_ollas())
         or olla_destino_id in (select app.mis_ollas()));
create policy solicitud_items_select on solicitud_items for select to authenticated
  using (solicitud_id in (select id from solicitudes));

-- El unico camino de escritura remota es el outbox.
create policy evento_sync_select on evento_sync for select to authenticated
  using (olla_id in (select app.mis_ollas()));
create policy evento_sync_insert on evento_sync for insert to authenticated
  with check (olla_id in (select app.mis_ollas()));
