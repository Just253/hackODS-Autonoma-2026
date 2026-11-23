-- 004_precios_escala.sql — la serie de precios guarda microcentesimos por unidad base.
--
-- ADR-0004: precios.precio es bigint (1 = 10^-6 centimo por unidad base). Este test
-- afirma el TIPO y los VALORES exactos de la siembra: con numeric(12,2) en soles el
-- precio por gramo se guardaba 0.00 (falso verde de conteos); si alguien reintenta
-- soles o redondea, se pone rojo.
-- Se corre tras `db reset` (el seed aplica) con `pnpm db:test` o `supabase test db`.

begin;

set local search_path to extensions, pg_temp, public;

select plan(2);

select is(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'precios' and column_name = 'precio'),
  'bigint',
  'precios.precio es bigint (microcentesimos por unidad base, ADR-0004)'
);

select is(
  (select array_agg(precio order by id) from precios
   where id in ('00000000-0000-4000-8000-000000000201',
                '00000000-0000-4000-8000-000000000202',
                '00000000-0000-4000-8000-000000000203',
                '00000000-0000-4000-8000-000000000204',
                '00000000-0000-4000-8000-000000000205',
                '00000000-0000-4000-8000-000000000206')),
  '{420000,510000,780000,230000,550000,940000}'::bigint[],
  'las seis filas base del seed son enteros de microcentesimos exactos (la serie demo añade más)'
);

select * from finish();

rollback;
