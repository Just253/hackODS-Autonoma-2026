-- 002_rls_salud.sql — #4: RLS por columna en `personas`.
--
-- Criterios del issue:
--   1. Cocinera con `request.jwt.claims`: leer `anemia`/`peso_kg`/`talla_cm`
--      lanza error de permiso (`42501`) en la tabla y da 0 filas en las vistas.
--   2. Nutricionista: el agregado funciona y no expone códigos P individuales.
--   3. Autocontenido: crea sus propias ollas, members, devices y personas con
--      uuid y códigos fijos; no depende del seed (que hoy no siembra `device_id`).
--   4. Fuga cruzada (R4 de docs/ARQUITECTURA.md): el nutricionista de la olla A
--      no ve nada de la olla B aunque tenga el MISMO rol en la suya.
--
-- Privilegios distintos a lo que la migración supone NO se pueden simular como
-- `postgres` (es el dueño y siempre pasa). El rojo→verde se hace revirtiendo
-- 20261123170000_rls_salud.sql a mano y corriendo esta suite.
--
-- pgTAP vive en `extensions` (migración del PR #2). El `set local` va dentro de
-- la transacción: fuera de ella es no-op y `plan()` no resolvería.
--
-- Runner: bajo `supabase test db` (CLI 3.2.0, node-pg-migrate) cada sentencia
-- corre como tarea suelta dentro de la misma transacción y `set local role`
-- persiste entre sentencias (medido: `reset role` vuelve a `postgres`). En los
-- bloques `throws_ok` el cambio de rol va DENTRO del bloque porque se ejecuta en
-- otra tarea, y `throws_ok` tolera el multi-query; `is_empty`/`is` no, así que
-- esas aserciones usan `set local role` antes y una consulta simple.

begin;

set local search_path to extensions, pg_temp, public;

select plan(22);

-- Fixtures sintéticos (D7: cero datos reales). Dos ollas, un nutricionista en
-- cada una, para probar la fuga cruzada con el rol coincidente.
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'olla A (test 002)', 'ZZZZA2', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'olla B (test 002)', 'ZZZZA3', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'hash-cocinera', 'rec-cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000c2', 'hash-nutri', 'rec-nutri'),
  ('bbbbbbbb-0000-4000-8000-0000000000c3', 'hash-organiza', 'rec-organiza'),
  ('bbbbbbbb-0000-4000-8000-0000000000c4', 'hash-nutri-b', 'rec-nutri-b');

insert into devices (user_id, member_id)
values
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-0000000000c1'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-0000000000c2'),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-0000-4000-8000-0000000000c3'),
  ('44444444-4444-4444-8444-444444444444', 'bbbbbbbb-0000-4000-8000-0000000000c4');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'nutricionista'),
  ('bbbbbbbb-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000001', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000c4', 'aaaaaaaa-0000-4000-8000-000000000002', 'nutricionista');

insert into personas (codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia, peso_kg, talla_cm, consentimiento_seguimiento, device_id)
values
  ('P-ZZ01', 'aaaaaaaa-0000-4000-8000-000000000001', 2020, 'F', 'nino', 'si', 18.50, 110.00, true, 'dev-test-a'),
  ('P-ZZ02', 'aaaaaaaa-0000-4000-8000-000000000001', 2022, 'M', 'nino', 'no', 12.00, 90.00, false, 'dev-test-a'),
  ('P-ZZ03', 'aaaaaaaa-0000-4000-8000-000000000001', 1950, 'M', 'adulto_mayor', 'no', 60.00, 165.00, false, 'dev-test-a'),
  ('P-ZZ04', 'aaaaaaaa-0000-4000-8000-000000000001', 1990, 'F', 'gestante', 'si', 55.00, 158.00, true, 'dev-test-a'),
  ('P-ZZ05', 'aaaaaaaa-0000-4000-8000-000000000002', 1995, 'F', 'adulto', 'no', 62.00, 160.00, false, 'dev-test-b');

-- ---------------------------------------------------------------------------
-- 1. Privilegios por columna (estables con y sin LOGIN).
-- ---------------------------------------------------------------------------
select ok(not has_column_privilege('authenticated', 'public.personas', 'anemia', 'select'), 'authenticated no tiene SELECT de personas.anemia');
select ok(not has_column_privilege('authenticated', 'public.personas', 'peso_kg', 'select'), 'authenticated no tiene SELECT de personas.peso_kg');
select ok(not has_column_privilege('authenticated', 'public.personas', 'talla_cm', 'select'), 'authenticated no tiene SELECT de personas.talla_cm');
select ok(has_column_privilege('authenticated', 'public.personas', 'codigo_p', 'select'), 'authenticated conserva SELECT de personas.codigo_p (padrón diario)');

-- ---------------------------------------------------------------------------
-- 2. Cocinera de la olla A: 42501 REAL al leer los flags.
--    `throws_ok` acepta multi-query; el `set local role` va dentro del bloque.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$set local role authenticated; select anemia from public.personas$$,
  '42501', null,
  'cocinera: select anemia from personas lanza 42501'
);

select throws_ok(
  $$set local role authenticated; select peso_kg, talla_cm from public.personas$$,
  '42501', null,
  'cocinera: select peso_kg/talla_cm from personas lanza 42501'
);

select throws_ok(
  $$set local role authenticated; select codigo_p, anemia from public.personas where olla_id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '42501', null,
  'cocinera: pedir anemia junto al padrón lanza 42501'
);

-- Ahora, la cocinera para las vistas (una sentencia: set local + claims + aserción).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is_empty(
  'select codigo_p from public.v_personas_salud',
  'cocinera: v_personas_salud devuelve 0 filas'
);

select is_empty(
  'select * from public.v_salud_agregado',
  'cocinera: v_salud_agregado devuelve 0 filas'
);

select is(
  (select count(*) from public.personas where olla_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  4::bigint,
  'cocinera: el padrón de su olla sigue legible (4 personas)'
);

-- ---------------------------------------------------------------------------
-- 3. Nutricionista de la olla A.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*) from public.v_personas_salud),
  4::bigint,
  'nutricionista: ve el detalle de salud de su olla (4 filas)'
);

select is(
  (select sum(con_anemia) from public.v_salud_agregado),
  2::bigint,
  'nutricionista: v_salud_agregado cuenta las 2 personas con anemia de su olla'
);

select is(
  (select sum(personas) from public.v_salud_agregado),
  4::bigint,
  'nutricionista: v_salud_agregado suma las 4 personas de su olla'
);

select is(
  (select peso_promedio_kg from public.v_salud_agregado where categoria = 'nino'),
  15.25::numeric,
  'nutricionista: v_salud_agregado promedia el peso del grupo niño (15,25 kg)'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'v_salud_agregado'
      and column_name = 'codigo_p'
  ),
  'nutricionista: v_salud_agregado no expone codigo_p'
);

select is(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'v_salud_agregado'),
  7::bigint,
  'nutricionista: v_salud_agregado es solo el agregado (7 columnas, sin códigos P)'
);

-- ---------------------------------------------------------------------------
-- 4. Fuga cruzada (R4): el nutricionista de B SÍ ve lo de B (control de que el
--    rol funciona) y el de A, con el mismo rol, NO ve nada de B.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}', true);

select is(
  (select count(*) from public.v_personas_salud),
  1::bigint,
  'nutricionista de B: control, ve la 1 persona de su olla'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*) from public.v_personas_salud where olla_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  0::bigint,
  'nutricionista de A: 0 filas de la olla B en v_personas_salud (mismo rol)'
);

select is(
  (select count(*) from public.v_salud_agregado where olla_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  0::bigint,
  'nutricionista de A: 0 filas de la olla B en v_salud_agregado (mismo rol)'
);

select is(
  (select count(*) from public.v_personas_salud where codigo_p = 'P-ZZ05'),
  0::bigint,
  'nutricionista de A: la persona con salud de B no aparece por código'
);

-- ---------------------------------------------------------------------------
-- 5. Organizadora de la olla A: el padrón, pero no el detalle de salud.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);

select is_empty(
  'select codigo_p from public.v_personas_salud',
  'organizadora: v_personas_salud devuelve 0 filas'
);

select is(
  (select count(*) from public.personas where olla_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  4::bigint,
  'organizadora: el padrón de su olla sigue legible (4 personas)'
);

select * from finish();

rollback;
