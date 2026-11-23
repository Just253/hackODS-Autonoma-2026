-- Firma del nutricionista: validar, auditar y retirar (#75, D3/DEC-2026-0003).
--
-- Antes de este PR: `validation` solo tenía SELECT (20261123150000:408),
-- `menu_template` solo SELECT, `servicios` solo SELECT, y no existía auditoría.
-- El nutricionista no podía firmar un menú ni publicarlo, y al retirar un menú
-- no quedaba rastro de quién lo hizo. Lo pide la decisión vigente
-- (DEC-20261123-1349-d04467: "el nutricionista ejecuta acciones cortas —firmar,
-- publicar, retirar, aprobar o rechazar con motivo— con auditoría append-only").
--
-- Fronteras de esta migración (ADR-0007 como patrón):
--   * INSERT con olla Y rol (`app.mi_rol`), nunca solo "autenticado".
--   * UPDATE por columna (`grant update (col)`) + policy que repite el filtro.
--   * Sin DELETE desde el cliente: se revoca; el retiro es un estado, no un borrado.
--
-- Lo que NO hace (y queda declarado): validar el contenido del menú contra su hash.
-- Eso es `validarMenu` (packages/nutrition, puro); la base exige sello completo y
-- registra la firma, no recalcula el menú.

-- ---------------------------------------------------------------------------
-- 1. Auditaria append-only: `auditoria`.
-- ---------------------------------------------------------------------------

-- Forma de `docs/ARQUITECTURA.md:813` (`id, member_id, olla_id, entidad, entidad_id,
-- accion, ts`), con dos cambios deliberados:
--   * `actor` guarda el `auth.uid()` (la sesión que actuó). El servidor nunca guardó
--     identidad de personas (D2) y `member_id` no es legible por el cliente desde
--     #62 (20261123192000): un actor `auth.uid()` sí identifica la sesión y no
--     duplica datos de personas.
--   * `antes`/`despues` en jsonb: la nutricionista necesita saber qué cambió, no
--     solo que cambió. `device_id` guarda el dispositivo que originó la acción.
create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  olla_id uuid not null references public.ollas on delete cascade,
  actor text not null,
  accion text not null check (accion in ('firmar', 'transicion', 'retirar', 'checklist')),
  entidad text not null,
  entidad_id text not null,
  antes jsonb,
  despues jsonb,
  at timestamptz not null default now(),
  device_id text
);

create index if not exists auditoria_olla_at_idx on public.auditoria (olla_id, at desc);
create index if not exists auditoria_entidad_idx on public.auditoria (entidad, entidad_id);

alter table public.auditoria enable row level security;

-- Lectura por olla; escritura SOLO por trigger (`security definer`), nunca por el
-- cliente: no hay policy de INSERT. `authenticated` conserva SELECT de las columnas
-- (el CLI de Supabase deja `grant all` por defecto; se revoca lo que no se concede).
revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

drop policy if exists auditoria_select on public.auditoria;
create policy auditoria_select on public.auditoria for select to authenticated
  using (olla_id in (select app.mis_ollas()));

-- Trigger genérico: `app.auditoria_log()` escribe una fila con el actor de la
-- sesión. `security definer` con `search_path` fijo (regla de supabase/AGENTS.md §3):
-- el que dispara es el cliente autenticado, que no tiene INSERT ni EXECUTE. La
-- acción llega como argumento fijo del trigger (`tg_argv[0]`); siendo AFTER, `new`
-- y `old` los resuelve el motor sin depender del tipo de fila.
create or replace function app.auditoria_log()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.auditoria (olla_id, actor, accion, entidad, entidad_id, antes, despues)
  values (
    new.olla_id,
    coalesce(auth.uid()::text, 'system'),
    tg_argv[0],
    tg_table_name,
    new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new)
  );

  return null; -- AFTER trigger: el valor devuelto se ignora.
end;
$$;

-- Sin EXECUTE para el cliente: solo la invocan los triggers (que corren como dueño).
revoke execute on function app.auditoria_log() from public, anon, authenticated;

-- Firmar (INSERT de validation).
drop trigger if exists validation_auditoria on public.validation;
create trigger validation_auditoria after insert on public.validation
  for each row execute function app.auditoria_log('firmar');

-- Publicar y transicionar (UPDATE de menu_template.estado). El retiro tiene su
-- propia acción, así que este trigger no duplica la fila cuando el destino es
-- `retirado`.
drop trigger if exists menu_template_transicion_auditoria on public.menu_template;
create trigger menu_template_transicion_auditoria after update of estado on public.menu_template
  for each row
  when (old.estado is distinct from new.estado and new.estado <> 'retirado')
  execute function app.auditoria_log('transicion');

-- Retirar tiene su propia acción: es el cierre con historial del menú.
drop trigger if exists menu_template_retiro_auditoria on public.menu_template;
create trigger menu_template_retiro_auditoria after update of estado on public.menu_template
  for each row
  when (new.estado = 'retirado' and old.estado is distinct from 'retirado')
  execute function app.auditoria_log('retirar');

-- Checklist de cocción (75 °C) del servicio. Solo cuando se marca, para no llenar
-- la auditoría con cada `null` que viaja en el outbox.
drop trigger if exists servicios_cocido_auditoria on public.servicios;
create trigger servicios_cocido_auditoria after update of cocido_a_75c on public.servicios
  for each row
  when (new.cocido_a_75c is true and old.cocido_a_75c is distinct from true)
  execute function app.auditoria_log('checklist');

-- ---------------------------------------------------------------------------
-- 2. `validation`: sello completo y veto de alergia (constraints).
-- ---------------------------------------------------------------------------

-- `validador`/`cnp`/`hash` entran NOT NULL desde el modelo base, pero un texto
-- vacío pasaba: el hash es el sello del menú y un blur no puede colar como firma.
alter table public.validation
  drop constraint if exists validation_identidad_no_vacia;
alter table public.validation
  add constraint validation_identidad_no_vacia
  check (btrim(validador) <> '' and btrim(cnp) <> '' and btrim(hash) <> '');

-- Alergia = veto absoluto (D3): un menú con un hallazgo de alergia no se firma
-- `aprobado`. El hallazgo lo emite `validarMenu`; aquí queda la regla de datos.
-- Un CHECK no admite subconsulta: se usa la función `anyarray` de core.
create or replace function app.hallazgo_es_alergia(p_hallazgos text[])
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select exists (
    select 1 from unnest(coalesce(p_hallazgos, '{}'::text[])) as h
    where h = 'alergia' or h like 'alergia:%'
  );
$$;

alter table public.validation
  drop constraint if exists validation_veto_alergia;
alter table public.validation
  add constraint validation_veto_alergia
  check (estado <> 'aprobado' or not app.hallazgo_es_alergia(hallazgos));

-- ---------------------------------------------------------------------------
-- 3. `validation`: INSERT solo del nutricionista (o admin) de la olla.
-- ---------------------------------------------------------------------------
drop policy if exists validation_insert on public.validation;
create policy validation_insert on public.validation for insert to authenticated
  with check (olla_id in (select app.mis_ollas())
              and app.mi_rol(olla_id) in ('nutricionista', 'admin'));

-- La plantilla firmada debe ser de la MISMA olla: la policy no puede mirar otra
-- tabla por fila, así que lo cierra el FK lógico con un trigger `before insert`.
-- `security definer`: corre como dueño porque el nutricionista no puede leer
-- `menu_template` de otra forma que por su policy (y aquí solo se mira `olla_id`),
-- y con `security invoker` la RLS devolvía 0 filas y la firma legítima fallaba 23503.
create or replace function app.validation_misma_olla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_olla uuid;
begin
  select mt.olla_id into v_olla
  from public.menu_template mt
  where mt.id = new.template_id;

  if v_olla is null or v_olla <> new.olla_id then
    raise exception 'validation: la plantilla % no pertenece a la olla %',
      new.template_id, new.olla_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists validation_misma_olla on public.validation;
create trigger validation_misma_olla before insert on public.validation
  for each row execute function app.validation_misma_olla();

-- Append-only: la corrección de una validación es otra fila, no un UPDATE
-- (patrón de `movimientos` y de la serie de precios, ADR-0004).
revoke update, delete, truncate on public.validation from authenticated;

-- ---------------------------------------------------------------------------
-- 4. `menu_template.estado`: transiciones legales, retiro con historial.
-- ---------------------------------------------------------------------------

-- Machine de estados de D3: borrador → en_revision → aprobado → publicado → retirado.
-- `retirado` es terminal; no hay vuelta a `borrador`. Pares permitidos explícitos.
create or replace function app.menu_template_transicion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_permitido boolean;
begin
  if new.estado is distinct from old.estado then
    v_permitido := (old.estado || '>' || new.estado) in (
      'borrador>en_revision',
      'en_revision>aprobado',
      'en_revision>borrador',
      'aprobado>publicado',
      'publicado>retirado',
      'aprobado>retirado'
    );

    if not v_permitido then
      raise exception 'menu_template: transicion % -> % no permitida (retirado es terminal)',
        old.estado, new.estado
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists menu_template_transicion on public.menu_template;
create trigger menu_template_transicion before update of estado on public.menu_template
  for each row execute function app.menu_template_transicion();

-- Column-grant: solo `estado`; el resto de la fila (hash, sello, perfil) no se
-- reescribe desde el cliente. La policy repite el filtro por olla y rol.
revoke update on table public.menu_template from authenticated;
grant update (estado) on table public.menu_template to authenticated;

drop policy if exists menu_template_update_estado on public.menu_template;
create policy menu_template_update_estado on public.menu_template for update to authenticated
  using (olla_id in (select app.mis_ollas())
         and app.mi_rol(olla_id) in ('nutricionista', 'admin'))
  with check (olla_id in (select app.mis_ollas())
              and app.mi_rol(olla_id) in ('nutricionista', 'admin'));

revoke delete, truncate on public.menu_template from authenticated;

-- ---------------------------------------------------------------------------
-- 5. `servicios.cocido_a_75c`: el checklist se persiste (D6, 75 °C).
-- ---------------------------------------------------------------------------

-- `null` = sin dato (la columna nace `default false`; el contrato acepta null como
-- "no se midió"). El modelo base la creó `not null`: se relaja aquí, porque un
-- `false` por defecto dice "no se midió" y no debe confundirse con "no se cocinó".
alter table public.servicios alter column cocido_a_75c drop not null;

-- Al marcarlo se sella la hora de verificación en el servidor.
create or replace function app.servicio_inocuidad()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cocido_a_75c is distinct from old.cocido_a_75c then
    new.inocuidad_verificada_en := case when new.cocido_a_75c is true then now() else null end;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists servicios_inocuidad on public.servicios;
create trigger servicios_inocuidad before update of cocido_a_75c on public.servicios
  for each row execute function app.servicio_inocuidad();

-- Column-grant: cocinera y organizadora marcan el checklist de SU olla; no tocan
-- `tipo`, `fecha`, `menu_day_id` ni la marca de sync.
grant update (cocido_a_75c) on table public.servicios to authenticated;

drop policy if exists servicios_update_75c on public.servicios;
create policy servicios_update_75c on public.servicios for update to authenticated
  using (olla_id in (select app.mis_ollas())
         and app.mi_rol(olla_id) in ('cocinera', 'organizadora', 'admin'))
  with check (olla_id in (select app.mis_ollas())
              and app.mi_rol(olla_id) in ('cocinera', 'organizadora', 'admin'));
