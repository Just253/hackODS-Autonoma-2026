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
--    cualquier otro rol.
create or replace view public.v_personas_salud as
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
alter view public.v_personas_salud set (security_invoker = false);
grant select on public.v_personas_salud to authenticated;

-- 3. Agregado: conteo por olla y categoría, nunca la fila de una persona.
create or replace view public.v_salud_agregado as
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
group by p.olla_id, p.categoria;
alter view public.v_salud_agregado set (security_invoker = false);
grant select on public.v_salud_agregado to authenticated;
