-- 013_zonas.sql — #92: zonas, precios por zona y admin global.
--
-- Criterios del issue:
--   1. Una organizadora de la olla A no ve los `precios_zona` de la zona de B
--      (0 filas), aunque el registro exista.
--   2. Dos ollas de la MISMA zona comparten precio: es la misma fila y vale lo
--      mismo desde el JWT de cada una.
--   3. El admin global ve las 8 ollas del seed (`app.mis_ollas()`) y las 3 zonas.
--   4. Una nutricionista ve solo su olla y solo la serie de su zona.
--   5. `precios_zona` sin INSERT/UPDATE/DELETE de cliente (42501) y `zonas` sin
--      escritura; anon no lee ninguna de las dos.
--
-- Autocontenido como 009: crea sus zonas, ollas, members y devices con uuid
-- fijos (prefijo eeeeee01). No depende de las filas del seed salvo para el admin
-- global (criterio 3 usa las 8 ollas y su member 999). `rollback` deshace todo.
--
-- Semantica del runner (medida en 006/009): cada asercion es una tarea suelta y
-- el `set local` de una no llega a la siguiente; un `do $$ … $$` es una sola
-- sentencia, y dentro de `throws_ok` el cambio de rol va dentro del bloque.
--
-- Rojo -> verde:
--   * quitando la rama `app.es_admin_global()` de `app.mis_ollas()` el admin
--     global pasa a ver 1 olla (falla el criterio 3 y la lectura de zona ajena).
--   * quitando la policy `precios_zona_select` los criterios 1, 2 y 4 leen 0.

begin;

set local search_path to extensions, pg_temp, public;

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixtures. La transaccion es de `postgres` (RLS no aplica al dueno).
-- ---------------------------------------------------------------------------
insert into public.zonas (id, nombre, distritos) values
  ('zz-sur',  'zona sur (test 013)',  array['distrito sur']),
  ('zz-este', 'zona este (test 013)', array['distrito este']);

insert into public.ollas (id, titulo, codigo, tipo, distrito, zona_id) values
  ('eeeeee01-0000-4000-8000-000000000001', 'olla sur A (test 013)', 'ZZZZF2', 'comun', 'distrito sur',  'zz-sur'),
  ('eeeeee01-0000-4000-8000-000000000002', 'olla sur B (test 013)', 'ZZZZF3', 'comun', 'distrito sur',  'zz-sur'),
  ('eeeeee01-0000-4000-8000-000000000003', 'olla este C (test 013)', 'ZZZZF4', 'comun', 'distrito este', 'zz-este');

insert into public.members (id, pin_hash, recovery_hash) values
  ('eeeeee01-0000-4000-8000-0000000000c1', 'hash-org-sur-a', 'rec-org-sur-a'),
  ('eeeeee01-0000-4000-8000-0000000000c2', 'hash-org-sur-b', 'rec-org-sur-b'),
  ('eeeeee01-0000-4000-8000-0000000000c3', 'hash-nutri-este', 'rec-nutri-este');

insert into public.devices (user_id, member_id) values
  ('eeeeee01-0000-4000-8000-0000000000d1', 'eeeeee01-0000-4000-8000-0000000000c1'),
  ('eeeeee01-0000-4000-8000-0000000000d2', 'eeeeee01-0000-4000-8000-0000000000c2'),
  ('eeeeee01-0000-4000-8000-0000000000d3', 'eeeeee01-0000-4000-8000-0000000000c3');

insert into public.olla_members (member_id, olla_id, rol) values
  ('eeeeee01-0000-4000-8000-0000000000c1', 'eeeeee01-0000-4000-8000-000000000001', 'organizadora'),
  ('eeeeee01-0000-4000-8000-0000000000c2', 'eeeeee01-0000-4000-8000-000000000002', 'organizadora'),
  ('eeeeee01-0000-4000-8000-0000000000c3', 'eeeeee01-0000-4000-8000-000000000003', 'nutricionista');

-- Una fila por zona e insumo/canal/fecha. La del sur es la MISMA para las dos
-- ollas de la zona (criterio 2): no se duplica por olla.
insert into public.precios_zona (zona_id, insumo_id, canal, unidad, precio, fecha, fuente) values
  ('zz-sur',  'arroz', 'mayorista', 'g', 420000, '2026-11-01', 'test-013'),
  ('zz-sur',  'arroz', 'minorista', 'g', 480000, '2026-11-01', 'test-013'),
  ('zz-este', 'arroz', 'mayorista', 'g', 441000, '2026-11-01', 'test-013');

-- ---------------------------------------------------------------------------
-- 0. Privilegios y constraints (antes de cambiar de rol).
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'public.zonas', 'select')
  and has_table_privilege('authenticated', 'public.precios_zona', 'select'),
  'authenticated tiene SELECT en zonas y precios_zona'
);

select ok(
  not has_table_privilege('authenticated', 'public.precios_zona', 'insert')
  and not has_table_privilege('authenticated', 'public.precios_zona', 'update')
  and not has_table_privilege('authenticated', 'public.precios_zona', 'delete')
  and not has_table_privilege('authenticated', 'public.precios_zona', 'truncate')
  and not has_table_privilege('authenticated', 'public.zonas', 'insert')
  and not has_table_privilege('anon', 'public.precios_zona', 'select')
  and not has_table_privilege('anon', 'public.zonas', 'select'),
  'sin escritura de cliente en precios_zona/zonas y anon no lee'
);

select throws_ok(
  $$insert into public.precios_zona (zona_id, insumo_id, canal, unidad, precio, fecha, fuente)
    values ('zz-sur', 'arroz', 'mayorista', 'g', 1, '2026-11-01', 'dup')$$,
  '23505', null,
  'unique (zona_id, insumo_id, canal, fecha): la serie de zona no se duplica'
);

select ok(
  (select count(*) from public.zonas) >= 3,
  'las 3 zonas de la red existen (lima-sur/este/norte) mas las 2 del test'
);

-- ---------------------------------------------------------------------------
-- 1. Organizadora de la olla A (zona sur): ve su zona y NO la del este.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeee01-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true),
          set_config('search_path', 'extensions, pg_temp, public', true);
end;
$$;

select is(
  (select count(*) from app.mis_ollas()),
  1::bigint,
  'la organizadora de A ve 1 olla'
);

select is(
  (select count(*) from precios_zona where zona_id = 'zz-sur'),
  2::bigint,
  'RLS: la organizadora de A ve las 2 filas de la zona sur'
);

select is(
  (select count(*) from precios_zona where zona_id = 'zz-este'),
  0::bigint,
  'RLS: la serie de la zona este NO se ve desde la zona sur'
);

-- ---------------------------------------------------------------------------
-- 2. Olla B, misma zona: misma fila, mismo precio (criterio compartido).
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeee01-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
end;
$$;

select is(
  (select count(*) from app.mis_ollas()),
  1::bigint,
  'la organizadora de B ve 1 olla'
);

select is(
  (select precio from precios_zona
   where zona_id = 'zz-sur' and insumo_id = 'arroz' and canal = 'mayorista'
     and fecha = '2026-11-01'),
  420000::bigint,
  'B lee el MISMO precio de zona que A (una sola fila compartida)'
);

select is(
  (select count(*) from precios_zona where zona_id = 'zz-sur' and insumo_id = 'arroz'),
  2::bigint,
  'no hay filas por olla: la zona sur tiene 2 filas de arroz, no 4'
);

-- ---------------------------------------------------------------------------
-- 3. Nutricionista de la olla C (zona este): solo la suya y solo su zona.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeee01-0000-4000-8000-0000000000d3","role":"authenticated"}', true);
end;
$$;

select is(
  (select count(*) from app.mis_ollas()),
  1::bigint,
  'la nutricionista de C ve 1 olla'
);

select is(
  (select array_agg(id) from ollas),
  array['eeeeee01-0000-4000-8000-000000000003']::uuid[],
  'la nutricionista solo lee su olla'
);

select is(
  (select count(*) from precios_zona where zona_id = 'zz-sur'),
  0::bigint,
  'la nutricionista de C no ve la serie de la zona sur'
);

select is(
  (select precio from precios_zona where zona_id = 'zz-este' and insumo_id = 'arroz'
   and canal = 'mayorista' and fecha = '2026-11-01'),
  441000::bigint,
  'la nutricionista de C lee la serie de su zona'
);

-- ---------------------------------------------------------------------------
-- 4. Admin global (member 999 del seed): ve las 8 ollas y las 3 zonas.
-- ---------------------------------------------------------------------------
-- Un admin global ve TODAS las ollas, aunque su fila de `olla_members` solo lo
-- ate a UNA. Se usan dos members distintos para que el criterio pueda fallar:
--   * `eeeeee03…c9` (dev `…d9`): admin SOLO en `zz-sur` A. Sin la rama
--     `es_admin_global()` de `mis_ollas()` veria 1; con la rama, todas.
--   * `eeeeee03…ca` (dev `…da`): admin en las 8 ollas del seed; su fila de
--     `olla_members` ya es admin en 8, asi que sirve para comprobar que la rama
--     no pierde lo que el member ya tenia.
-- Tercer argumento `false` en set_config: con `true` es LOCAL y se revierte al
-- cerrar la sentencia, y la tarea siguiente volvia a ver el `postgres` de la
-- transaccion (medido). pgTAP corre cada `is`/`ok` como tarea aparte.
do $$
begin
  perform set_config('role', 'postgres', false);
  insert into public.members (id, pin_hash, recovery_hash) values
    ('eeeeee03-0000-4000-8000-0000000000c9', 'hash-admin-una-olla', 'rec-admin-una-olla'),
    ('eeeeee03-0000-4000-8000-0000000000ca', 'hash-admin-red',      'rec-admin-red');
  insert into public.devices (user_id, member_id) values
    ('eeeeee03-0000-4000-8000-0000000000d9', 'eeeeee03-0000-4000-8000-0000000000c9'),
    ('eeeeee03-0000-4000-8000-0000000000da', 'eeeeee03-0000-4000-8000-0000000000ca');
  insert into public.olla_members (member_id, olla_id, rol) values
    ('eeeeee03-0000-4000-8000-0000000000c9', 'eeeeee01-0000-4000-8000-000000000001', 'admin');
  insert into public.olla_members (member_id, olla_id, rol)
  select 'eeeeee03-0000-4000-8000-0000000000ca', o.id, 'admin'
  from ollas o
  where o.id::text like '00000000-0000-4000-8000-00000000000%';
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeee03-0000-4000-8000-0000000000d9","role":"authenticated"}', false);
  perform set_config('role', 'authenticated', false);
end;
$$;

-- Admin global con UNA sola fila de olla_members. Se compara con el 9 literal
-- (8 del seed + la suya) y no con `count(*) from ollas`: dentro de la tarea de
-- `authenticated` esa cuenta tambien pasa por RLS y devolveria 1, y el criterio
-- pasaria en verde sin la rama (medido). `>= 9` solo se cumple con la rama.
select cmp_ok(
  (select count(*) from app.mis_ollas()),
  '>=',
  9::bigint,
  'admin global atado a 1 olla ve sus 1 + las 8 ollas del seed'
);

-- Admin global: lee la serie de una zona que no es la de su olla de miembro.
select cmp_ok(
  (select count(*) from precios_zona where zona_id = 'zz-este'),
  '>=',
  1::bigint,
  'el admin global lee la serie de una zona que no es la de ninguna olla suya'
);

-- El segundo admin (admin en las 8 del seed) conserva las 8.
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeee03-0000-4000-8000-0000000000da","role":"authenticated"}', false);
end;
$$;

select cmp_ok(
  (select count(*) from app.mis_ollas()),
  '>=',
  8::bigint,
  'el admin de las 8 ve las 8 (la rama no pierde lo que ya veia)'
);

select cmp_ok(
  (select count(*) from ollas),
  '>=',
  8::bigint,
  'RLS de ollas: el admin global lee al menos las 8 del seed'
);

select is(
  (select count(*) from ollas o
   where o.id::text like '00000000-0000-4000-8000-00000000000%'
     and o.id not in (select app.mis_ollas())),
  0::bigint,
  'app.mis_ollas() del admin global cubre las 8 ollas del seed'
);

select is(
  (select count(*) from zonas where id in ('lima-sur', 'lima-este', 'lima-norte')),
  3::bigint,
  'el admin global ve las 3 zonas de la red'
);

select is(
  (select count(distinct o.zona_id)::int
   from ollas o
   where o.id in (
     '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
     '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004',
     '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006',
     '00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000008'
   )),
  3,
  'las 8 ollas del seed cubren las 3 zonas'
);

-- ---------------------------------------------------------------------------
-- 5. Escrituras desde el cliente: 42501 (sin grant).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.precios_zona (zona_id, insumo_id, canal, unidad, precio, fecha, fuente)
    values ('zz-sur', 'arroz', 'mayorista', 'g', 1, '2026-11-02', 'cliente')$$,
  '42501', null,
  'sin INSERT de cliente en precios_zona (ingesta = servidor)'
);

select throws_ok(
  $$update public.precios_zona set precio = 1$$,
  '42501', null,
  'sin UPDATE de cliente en precios_zona'
);

select throws_ok(
  $$delete from public.precios_zona$$,
  '42501', null,
  'sin DELETE de cliente en precios_zona'
);

select * from finish();

rollback;
