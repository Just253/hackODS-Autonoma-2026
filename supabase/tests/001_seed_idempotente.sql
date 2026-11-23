-- 001_seed_idempotente.sql — el seed se puede correr dos veces sin cambiar el estado.
-- Se corre con `supabase test db` (pgTAP), con el seed ya aplicado por `db reset`.
--
-- Toma los conteos por tabla, vuelve a ejecutar supabase/seed.sql y comprueba que
-- no cambian. Si alguien quita un `on conflict ... do nothing`, la segunda corrida
-- choca con la primary/unique key (23505) o duplica filas, y el test se pone rojo.
--
-- El seed se lee del disco, no se duplica aca: una sola copia (skill testing-fixtures).
-- NOTA DE ENTORNO: `supabase test db` monta SOLO el directorio de tests en el
-- contenedor de pg_prove; con ese mount `../seed.sql` no es alcanzable. Por eso
-- este test corre con `pnpm db:test` (scripts/db-test.mjs), que copia el seed
-- a tests/fixtures/ (fuera del glob *.sql de pg_prove) antes de la suite y lo
-- borra al terminar.

begin;

-- pgTAP vive en el schema `extensions` (migracion 20261123155000_pgtap; el CLI de
-- supabase tambien lo crea/descarta de forma transitoria al correr `test db`).
set search_path to extensions, pg_temp, public;

select plan(1);

create function pg_temp.conteos() returns jsonb
language sql
as $$
  select jsonb_object_agg(nombre, n)
  from (
    select 'ollas' as nombre, count(*) as n from ollas
    union all select 'members', count(*) from members
    union all select 'olla_members', count(*) from olla_members
    union all select 'personas', count(*) from personas
    union all select 'insumos', count(*) from insumos
    union all select 'precios', count(*) from precios
    union all select 'menu_template', count(*) from menu_template
    union all select 'menu_day', count(*) from menu_day
    union all select 'dish', count(*) from dish
    union all select 'ingredient', count(*) from ingredient
    union all select 'portion', count(*) from portion
    union all select 'menu_constraint', count(*) from menu_constraint
    union all select 'substitution', count(*) from substitution
    union all select 'validation', count(*) from validation
    union all select 'movimientos', count(*) from movimientos
    union all select 'solicitudes', count(*) from solicitudes
    union all select 'solicitud_items', count(*) from solicitud_items
    union all select 'evento_sync', count(*) from evento_sync
  ) t;
$$;

create temp table antes as select pg_temp.conteos() as c;

\ir fixtures/seed.txt

select is(pg_temp.conteos(), (select c from antes), 'el seed repetido no cambia los conteos');

select * from finish();

rollback;
