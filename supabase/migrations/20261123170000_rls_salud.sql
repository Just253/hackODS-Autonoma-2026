-- RLS por columna para los datos de salud de `personas` (#4).
--
-- RLS decide por fila, no por columna: `personas_select` deja entrar al padrón
-- sin comprobar el rol, así que `anemia`, `peso_kg` y `talla_cm` quedaban
-- legibles por cualquiera de la olla (incluida la cocinera). Ver
-- docs/adr/0005-rls-salud.md. Se arregla con privilegios por columna + vistas:
--
--   * `authenticated` conserva SELECT solo de las columnas no sensibles.
--   * `v_personas_salud` da el detalle de salud a nutricionista y admin.
--   * `v_salud_agregado` da conteos por categoría (con `con_anemia`), sin
--     `codigo_p` ni valores individuales.
-- Las policies de `personas` no cambian: siguen siendo la frontera por fila; la
-- exposición de los datos de salud la deciden los grants y las dos vistas.
--
-- Medido antes de elegirlas:
--   * `security_invoker = true` NO sirve: tras el revoke de columna la vista da
--     "permission denied for table personas" al leer `anemia`.
--   * `security_invoker = false` corre como su dueño (`postgres`), que no está
--     sujeto a RLS: ve todas las ollas salvo que su `where` filtre. Y una policy
--     sobre la vista se evalúa como quien consulta (tampoco puede leer `anemia`).
--   Por eso el filtro por olla vive en el SQL de la vista y la vista no tiene policy.

-- 1. Columnas no sensibles para `authenticated`. `notas` queda fuera: es texto
--    libre del padrón y nada del servidor lo consume (packages/contracts).
revoke select on public.personas from authenticated;
grant select (
  codigo_p, olla_id, anio_nacimiento, sexo, categoria,
  consentimiento_seguimiento, created_at, updated_at, deleted_at
) on public.personas to authenticated;

-- 2. Detalle de salud: nutricionista y admin, solo en sus ollas. 0 filas para
--    cualquier otro rol. Las referencias van calificadas (`public.personas`,
--    `app.mis_ollas`, `app.mi_rol`) y las vistas no son `security definer`
--    (no son funciones): `search_path` no aplica acá; ver docs/contracts/personas-salud.md §6.
create or replace view public.v_personas_salud
with (security_invoker = false) as
select
  p.codigo_p,
  p.olla_id,
  p.anio_nacimiento,
  p.sexo,
  p.categoria,
  p.anemia,
  p.peso_kg,
  p.talla_cm,
  p.consentimiento_seguimiento,
  p.updated_at
from public.personas p
where p.deleted_at is null
  and p.olla_id in (select app.mis_ollas())
  and app.mi_rol(p.olla_id) in ('nutricionista', 'admin');
grant select on public.v_personas_salud to authenticated;

-- 3. Agregado: conteo por olla y categoría, nunca la fila de una persona.
--    `having count(*) >= 10` aplica el criterio de privacidad del repo (k ≥ 10
--    para agregados, docs/contracts/comprobantes.md §0.3): un grupo chico se
--    suprime y no reconstruye el peso de una sola persona.
create or replace view public.v_salud_agregado
with (security_invoker = false) as
select
  p.olla_id,
  p.categoria,
  count(*)::int as personas,
  count(*) filter (where p.consentimiento_seguimiento)::int as con_consentimiento,
  count(*) filter (where p.anemia = 'si')::int as con_anemia,
  count(*) filter (where p.peso_kg is not null or p.talla_cm is not null)::int as con_medida,
  round(avg(p.peso_kg), 2) as peso_promedio_kg
from public.personas p
where p.deleted_at is null
  and p.olla_id in (select app.mis_ollas())
  and app.mi_rol(p.olla_id) in ('nutricionista', 'admin')
group by p.olla_id, p.categoria
having count(*) >= 10;
grant select on public.v_salud_agregado to authenticated;

-- 4. Pull de sync sin datos de salud para quien no puede verlos (#4, ALTA de
--    la revisión del PR #23). `sync-pull` devuelve el `payload` del outbox tal
--    cual y `evento_sync_select` filtra por olla, no por rol: una cocinera que
--    hace `GET /sync/pull` recibía `anemia`/`pesoKg`/`tallaCm`/`notas` de las
--    personas de su olla. La vista sanea el payload en el servidor, antes de que
--    salga por la API; el TS no recompone lo que no le llega.
--
--    `security_invoker = false` y el mismo patrón que las vistas de salud: lee
--    `evento_sync` como dueño (la policy de olla se aplicaría igual, pero el
--    `where` explícito deja la frontera en un solo lugar y la vista es testeable
--    con pgTAP).
create or replace view public.v_evento_sync_pull
with (security_invoker = false) as
select
  e.event_uuid,
  e.idempotency_key,
  e.lamport,
  e.device_id,
  e.olla_id,
  e.entidad,
  case
    when e.entidad = 'personas'
      and app.mi_rol(e.olla_id) not in ('nutricionista', 'admin')
      then e.payload - 'anemia' - 'pesoKg' - 'tallaCm' - 'notas'
    else e.payload
  end as payload,
  e.estado,
  e.creado_en
from public.evento_sync e
where e.olla_id in (select app.mis_ollas());
grant select on public.v_evento_sync_pull to authenticated;
