-- 009_catalogo.sql — #63: catalogo de productos y serie por producto (`precio_observado`).
--
-- Criterios del issue:
--   1. Dos ollas no comparten observaciones: con el JWT de A, `precio_observado`
--      devuelve SOLO las de A (0 filas de B, aun con la misma sesion).
--   2. La cocinera LEE su serie y NO puede escribir (INSERT/UPDATE/DELETE = 42501).
--   3. El catalogo (`producto_catalogo`, `producto_alias`) es global: lo lee todo
--      autenticado, y tampoco se escribe desde el cliente.
--   4. La mediana por producto se puede calcular desde la tabla
--      (`percentile_cont(0.5)` sobre >= 7 observaciones) y da el valor sembrado.
--   5. Producto sin historia -> 0 filas (la pantalla dice "sin dato", no inventa).
--
-- Autocontenido como 002/006: crea sus ollas/members/devices. Reusa dos de los
-- productos del seed (uuid fijo por slug) solamente para colgar observaciones; no
-- depende de las filas de `precio_observado` del seed (las agrega en la
-- transaccion, que `rollback` deshace).
--
-- Semantica de este runner (medido en 006): cada asercion es una tarea suelta y el
-- `set local` de una NO llega a la siguiente; un `do $$ … $$` es una sola sentencia,
-- y dentro de `throws_ok` el cambio de rol va DENTRO del bloque (subtransaccion).
--
-- Rojo -> verde: quitando la policy `precio_observado_select` de 20261123194000
-- fallan (1) y (4): 0 filas con el JWT de la propia olla.

begin;

set local search_path to extensions, pg_temp, public;

select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures. La transaccion es de `postgres` (RLS no aplica al dueno).
-- ---------------------------------------------------------------------------
insert into public.ollas (id, titulo, codigo, tipo, distrito)
values
  ('eeeeee00-0000-4000-8000-000000000001', 'olla catalogo A (test 009)', 'ZZZZC2', 'comun', 'test'),
  ('eeeeee00-0000-4000-8000-000000000002', 'olla catalogo B (test 009)', 'ZZZZC3', 'comun', 'test');

insert into public.members (id, pin_hash, recovery_hash)
values
  ('eeeeee00-0000-4000-8000-0000000000c1', 'hash-cocinera-a', 'rec-cocinera-a'),
  ('eeeeee00-0000-4000-8000-0000000000c2', 'hash-cocinera-b', 'rec-cocinera-b');

insert into public.devices (user_id, member_id)
values
  ('eeeeee00-0000-4000-8000-0000000000d1', 'eeeeee00-0000-4000-8000-0000000000c1'),
  ('eeeeee00-0000-4000-8000-0000000000d2', 'eeeeee00-0000-4000-8000-0000000000c2');

insert into public.olla_members (member_id, olla_id, rol)
values
  ('eeeeee00-0000-4000-8000-0000000000c1', 'eeeeee00-0000-4000-8000-000000000001', 'cocinera'),
  ('eeeeee00-0000-4000-8000-0000000000c2', 'eeeeee00-0000-4000-8000-000000000002', 'cocinera');

-- Observaciones: la olla A tiene 7 de `arroz` (mediana exacta = 4200), la olla B
-- tiene 2 de `arroz` (no debe verse desde A). Productos del seed (uuid fijo).
insert into public.precio_observado
  (id, olla_id, producto_id, fecha, canal, unidad_base, cantidad_milesimas,
   precio_microcent_por_base, moneda, origen, calidad_evidencia, estado, lamport, device_id)
values
  ('eeeeee00-0000-4000-8000-000000000101', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-01', 'mayorista', 'g', 1000, 1200, 'PEN',
   'compra', 'papel', 'valido', 1, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000102', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-02', 'minorista', 'g', 1000, 2200, 'PEN',
   'compra', 'papel', 'valido', 2, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000103', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-03', 'mayorista', 'g', 1000, 3200, 'PEN',
   'compra', 'papel', 'valido', 3, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000104', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-04', 'minorista', 'g', 1000, 4200, 'PEN',
   'compra', 'papel', 'valido', 4, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000105', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-05', 'mayorista', 'g', 1000, 5200, 'PEN',
   'compra', 'papel', 'valido', 5, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000106', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-06', 'minorista', 'g', 1000, 6200, 'PEN',
   'compra', 'papel', 'valido', 6, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000107', 'eeeeee00-0000-4000-8000-000000000001',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-07', 'mayorista', 'g', 1000, 7200, 'PEN',
   'compra', 'papel', 'valido', 7, 'dev-test-009'),
  ('eeeeee00-0000-4000-8000-000000000201', 'eeeeee00-0000-4000-8000-000000000002',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-01', 'mayorista', 'g', 1000, 9999, 'PEN',
   'compra', 'papel', 'valido', 1, 'dev-test-009-b'),
  ('eeeeee00-0000-4000-8000-000000000202', 'eeeeee00-0000-4000-8000-000000000002',
   '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-02', 'minorista', 'g', 1000, 9998, 'PEN',
   'compra', 'papel', 'valido', 2, 'dev-test-009-b');

-- ---------------------------------------------------------------------------
-- 0. Privilegios de tabla: lecturas si, escrituras no (antes de cambiar de rol,
--    `has_table_privilege` no depende de la sesion).
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'public.producto_catalogo', 'select')
  and has_table_privilege('authenticated', 'public.producto_alias', 'select')
  and has_table_privilege('authenticated', 'public.precio_observado', 'select'),
  'authenticated tiene SELECT en catalogo, alias y precio_observado'
);

select ok(
  not has_table_privilege('authenticated', 'public.precio_observado', 'insert')
  and not has_table_privilege('authenticated', 'public.precio_observado', 'update')
  and not has_table_privilege('authenticated', 'public.precio_observado', 'delete')
  and not has_table_privilege('authenticated', 'public.producto_catalogo', 'insert')
  and not has_table_privilege('anon', 'public.precio_observado', 'select'),
  'sin INSERT/UPDATE/DELETE de cliente y anon no lee la serie'
);

-- ---------------------------------------------------------------------------
-- 1. JWT de la cocinera de A: ve SOLO su serie.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeee00-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
  perform set_config('role', 'authenticated', true),
          set_config('search_path', 'extensions, pg_temp, public', true);
end;
$$;

select is(
  (select count(*) from app.mis_ollas()),
  1::bigint,
  'la cocinera de A ve 1 olla'
);

select is(
  (select count(*) from precio_observado),
  7::bigint,
  'RLS: solo las 7 observaciones de la olla A (las 2 de B no se ven)'
);

select is(
  (select count(distinct olla_id) from precio_observado),
  1::bigint,
  'RLS: todas las filas visibles son de una sola olla'
);

select is(
  (select count(*) from precio_observado
   where id in ('eeeeee00-0000-4000-8000-000000000201', 'eeeeee00-0000-4000-8000-000000000202')),
  0::bigint,
  'RLS: las observaciones de la olla B no aparecen'
);

-- ---------------------------------------------------------------------------
-- 2. Catalogo global: visible entero aunque no sea de su olla.
-- ---------------------------------------------------------------------------
select cmp_ok(
  (select count(*) from producto_catalogo),
  '>=',
  7::bigint,
  'el catalogo es global: la cocinera lee al menos los 7 productos del seed'
);

-- ---------------------------------------------------------------------------
-- 3. Escrituras de la cocinera: 42501 (sin grant, no solo RLS).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.precio_observado
      (olla_id, producto_id, fecha, canal, unidad_base, cantidad_milesimas,
       precio_microcent_por_base, moneda, origen, calidad_evidencia, estado, lamport, device_id)
    values ('eeeeee00-0000-4000-8000-000000000001',
            '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-08', 'mayorista', 'g', 1000,
            5000, 'PEN', 'compra', 'papel', 'valido', 8, 'dev-test-009')$$,
  '42501', null,
  'la cocinera no puede INSERTAR observaciones (ingesta = servidor)'
);

select throws_ok(
  $$update public.precio_observado set precio_microcent_por_base = 1$$,
  '42501', null,
  'la cocinera no puede UPDATEAR la serie (es inmutable)'
);

select throws_ok(
  $$delete from public.precio_observado$$,
  '42501', null,
  'la cocinera no puede BORRAR la serie'
);

select throws_ok(
  $$insert into public.producto_catalogo
      (id, slug, nombre, categoria, unidad_base, perecedero)
    values ('99999999-0000-4000-8000-000000000001', 'falso', 'Falso', 'otros', 'g', false)$$,
  '42501', null,
  'la cocinera no puede INSERTAR en el catalogo (solo servidor)'
);

-- ---------------------------------------------------------------------------
-- 4. Mediana por producto desde la tabla (>= 7 obs) y producto sin historia.
-- ---------------------------------------------------------------------------
select is(
  (select round(percentile_cont(0.5) within group (order by precio_microcent_por_base))::bigint
   from precio_observado
   where producto_id = '2ff27c34-b456-5826-b6ed-21437e0b04fc'
     and estado = 'valido'),
  4200::bigint,
  'mediana por producto desde la tabla (7 obs, percentile_cont)'
);

select is(
  (select count(*)
   from precio_observado
   where producto_id = '4c0b5238-15b4-5edd-b656-ad10ba418769'),  -- pollo: no llego a esta olla
  0::bigint,
  'producto sin historia: 0 filas (la pantalla muestra "sin dato")'
);

select * from finish();

rollback;
