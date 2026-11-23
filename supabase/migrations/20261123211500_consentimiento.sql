-- Consentimiento del seguimiento y de las estadísticas (#74).
--
-- Qué resuelve: hasta hoy el consentimiento era un booleano en `personas`
-- (`consentimiento_seguimiento`) que el alta fijaba en `false`. El informe
-- (Despensa Solidaria, Anexo A) pide dos permisos separados, opt-in separado del
-- plato, **revocación que gana** y agregados solo sobre quienes consintieron.
--
-- Decisiones de esta migración (ADR: docs/adr/0009-consentimiento.md):
--   * Append-only de verdad: cada firma es una fila nueva; revocar es otra fila
--     con `otorgado = false` y `revocado_en`. `authenticated` solo tiene SELECT
--     e INSERT: UPDATE, DELETE y TRUNCATE se revocan (42501). Una revocación no
--     puede "corregirse" reescribiendo la fila, que es justo lo que un tribunal
--     de datos no acepta.
--   * La persona se referencia por `codigo_p` (D2) y la FK es **compuesta**
--     (`olla_id`, `persona_id`): una firma no puede apuntar a una persona de
--     otra olla ni escribiendo como dueño de la base. La frontera no queda solo
--     en la policy.
--   * RLS por olla: SELECT e INSERT para cualquier miembro de la olla; nadie ve
--     el consentimiento de otra olla.
--   * `evento_sync.entidad` admite `consentimiento` para que la firma viaje por
--     el outbox como cualquier otro cambio.

-- ---------------------------------------------------------------------------
-- 1. La tabla append-only
-- ---------------------------------------------------------------------------

-- FK compuesta: `codigo_p` ya es único (PK); el par (olla, persona) es lo que
-- permite que la FK de abajo impida cruzar ollas.
alter table public.personas
  add constraint personas_olla_codigo_key unique (olla_id, codigo_p);

create table public.consentimiento (
  -- UUID generado en el dispositivo (D5): la base no inventa ids de eventos.
  id uuid primary key,
  olla_id uuid not null references public.ollas on delete cascade,
  persona_id text not null,
  tipo text not null check (tipo in ('seguimiento', 'estadisticas')),
  -- `true` = otorgó; `false` = revocó. La fila nunca se edita.
  otorgado boolean not null,
  -- Versión del texto que se firmó; el texto cambia, la firma no.
  version integer not null check (version >= 1),
  firmado_en timestamptz not null,
  -- Solo en la fila de revocación; `null` en la de otorgamiento.
  revocado_en timestamptz,
  device_id text not null,
  lamport bigint not null default 0 check (lamport >= 0),
  constraint consentimiento_persona_fk
    foreign key (olla_id, persona_id) references public.personas (olla_id, codigo_p)
    on delete cascade,
  -- Una fila es otorgamiento o revocación, nunca las dos cosas a medias.
  constraint consentimiento_revocacion_coherente check (
    (otorgado and revocado_en is null) or (not otorgado and revocado_en is not null)
  ),
  constraint consentimiento_revocacion_posterior check (
    revocado_en is null or revocado_en >= firmado_en
  )
);

comment on table public.consentimiento is
  'Firmas de consentimiento (seguimiento y estadísticas). Append-only: revocar es una fila nueva.';
comment on column public.consentimiento.lamport is
  'Reloj de Lamport del dispositivo: ordena la última firma, no el horario de llegada.';

-- La lectura caliente es "la última firma de esta persona y este permiso".
create index consentimiento_persona_idx
  on public.consentimiento (persona_id, tipo, lamport desc);

-- ---------------------------------------------------------------------------
-- 2. RLS: la olla propia, nada más
-- ---------------------------------------------------------------------------
alter table public.consentimiento enable row level security;

create policy consentimiento_select on public.consentimiento for select to authenticated
  using (olla_id in (select app.mis_ollas()));

-- Registrar la firma lo puede hacer cualquier miembro de la olla (la cocinera
-- también recibe el "sí" en el papel del comedor). No hay policy de UPDATE ni
-- de DELETE: no es que no se pueda, es que no existe la operación.
create policy consentimiento_insert on public.consentimiento for insert to authenticated
  with check (olla_id in (select app.mis_ollas()));

-- Sin UPDATE/DELETE/TRUNCATE desde el cliente. No se confía en el `grant all`
-- por defecto de Supabase: se revoca todo y se concede exactamente lo que el
-- flujo usa (mismo criterio que 20261123191000_escritura_por_flujo.sql).
revoke all on table public.consentimiento from anon, authenticated;
grant select, insert on table public.consentimiento to authenticated;

-- ---------------------------------------------------------------------------
-- 3. evento_sync: la entidad nueva
-- ---------------------------------------------------------------------------
alter table public.evento_sync drop constraint if exists evento_sync_entidad_check;
alter table public.evento_sync add constraint evento_sync_entidad_check
  check (entidad in (
    'personas', 'raciones', 'movimientos', 'solicitudes', 'precios', 'menus', 'consentimiento'
  ));

-- ---------------------------------------------------------------------------
-- 4. Agregado de salud: solo cuenta personas con `seguimiento` vigente
--
--    La vista de 20261123170000_rls_salud.sql promediaba a TODAS las personas
--    de la olla (`where p.consentimiento_seguimiento` solo alimentaba la
--    columna `con_consentimiento`). El criterio del issue es que ningún
--    agregado use datos de salud de quien no consintió.
--
--    "Vigente" = la última firma de esa persona para `seguimiento` está
--    otorgada y sin revocar. `distinct on` con el orden contractual
--    (`lamport` desc, después `firmado_en`, `device_id` e `id`) hace que el
--    resultado no dependa del orden en que llegaron las filas. Una revocación
--    nueva saca a la persona del conteo en el acto; volver a otorgar la
--    devuelve.
--
--    `k >= 10` no cambia: el `having` se aplica sobre el conjunto ya filtrado,
--    así que una revocación puede dejar un grupo por debajo de 10 y el grupo se
--    suprime (que es lo correcto: no se reconstruye el dato de una persona).
--
--    `con_consentimiento` pasa a contar el permiso de **estadísticas** (el de
--    seguimiento ya es el filtro de toda la fila): es la única lectura que
--    agrega información y mantiene las 7 columnas que ya consume el cliente.
-- ---------------------------------------------------------------------------
create or replace view public.v_salud_agregado
with (security_invoker = false) as
with ultima_firma as (
  select distinct on (c.persona_id, c.tipo)
    c.persona_id,
    c.tipo,
    c.otorgado,
    c.revocado_en
  from public.consentimiento c
  order by
    c.persona_id,
    c.tipo,
    c.lamport desc,
    c.firmado_en desc,
    c.device_id desc,
    c.id desc
),
vigente as (
  select persona_id, tipo
  from ultima_firma
  where otorgado and revocado_en is null
)
select
  p.olla_id,
  p.categoria,
  count(*)::int as personas,
  count(*) filter (where est.persona_id is not null)::int as con_consentimiento,
  count(*) filter (where p.anemia = 'si')::int as con_anemia,
  count(*) filter (where p.peso_kg is not null or p.talla_cm is not null)::int as con_medida,
  round(avg(p.peso_kg), 2) as peso_promedio_kg
from public.personas p
-- `join` y no `left join`: sin consentimiento de seguimiento vigente la
-- persona no entra al agregado. Ese es el punto del issue.
join vigente seg
  on seg.persona_id = p.codigo_p and seg.tipo = 'seguimiento'
left join vigente est
  on est.persona_id = p.codigo_p and est.tipo = 'estadisticas'
where p.deleted_at is null
  and p.olla_id in (select app.mis_ollas())
  and app.mi_rol(p.olla_id) in ('nutricionista', 'admin')
group by p.olla_id, p.categoria
having count(*) >= 10;

grant select on public.v_salud_agregado to authenticated;
