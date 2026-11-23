-- 005_escritura_flujos.sql — #58: escritura por flujo (ADR-0007).
--
-- Criterios del issue, uno por policy:
--   1. `precios`: la cocinera inserta en SU olla; la misma cocinera en otra
--      olla, 0 filas (policy filtra fila).
--   2. `servicios`: idem.
--   3. `solicitudes`/`solicitud_items`: la organizadora crea el pedido en
--      `borrador` desde su olla; en otra olla, 0 filas.
--   4. `solicitudes`: UPDATE de SOLO `estado`; cualquier otra columna lanza
--      42501 (column-grant). Roles que no son organizadora no escriben.
--   5. Sin DELETE en ninguna: 42501.
--
-- Autocontenido (mismo patrón que 002/003): crea ollas, members, devices,
-- insumos y solicitudes con uuid fijos; no depende del seed. Rojo→verde se
-- hace revirtiendo 20261123191000_escritura_por_flujo.sql a mano.
--
-- El runner corre cada sentencia como tarea suelta de la MISMA transacción y
-- `set local role` persiste; dentro de `throws_ok` el `set local role` va
-- DENTRO del bloque (la tarea es otra).

begin;

set local search_path to extensions, pg_temp, public;

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures: olla P (donde la cocinera y la organizadora trabajan), olla Q
-- (la ajena) y olla R (destino del pedido, ajena a P).
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'olla P (test 005)', 'ZZB2TT', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'olla Q (test 005)', 'ZZB3TT', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-0000000000d3', 'olla R (test 005)', 'ZZB4TT', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'hash-cocinera-p', 'rec-cocinera-p'),
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'hash-organiza-p', 'rec-organiza-p'),
  ('bbbbbbbb-0000-4000-8000-0000000000f3', 'hash-cocinera-q', 'rec-cocinera-q'),
  ('bbbbbbbb-0000-4000-8000-0000000000f4', 'hash-organiza-q', 'rec-organiza-q'),
  ('bbbbbbbb-0000-4000-8000-0000000000f5', 'hash-organiza-r', 'rec-organiza-r');

insert into devices (user_id, member_id)
values
  ('80000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000f1'),
  ('80000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000f2'),
  ('80000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-0000000000f3'),
  ('80000000-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-0000000000f4'),
  ('80000000-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-0000000000f5');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000f3', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000f4', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000f5', 'aaaaaaaa-0000-4000-8000-0000000000d3', 'organizadora');

-- Insumos en cada olla: precios y solicitud_items los referencian.
insert into insumos (id, olla_id, denominacion, grupo, unidad_base, device_id)
values
  ('zz-arroz-p', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'Arroz (test)', 'cereal', 'g', 'dev-p'),
  ('zz-arroz-q', 'aaaaaaaa-0000-4000-8000-0000000000d2', 'Arroz Q (test)', 'cereal', 'g', 'dev-q');

-- Una solicitud ajena (olla Q -> olla P) que la organizadora de P NO debe poder
-- cambiar de estado: no es organizadora de Q ni el origen es suyo.
insert into solicitudes (id, olla_origen_id, olla_destino_id, estado, device_id)
values ('cccccccc-0000-4000-8000-0000000000a1',
        'aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-0000000000d1',
        'enviada', 'dev-q');

-- ---------------------------------------------------------------------------
-- 1. Privilegios por columna (estable como postgres, dueño de la tabla).
-- ---------------------------------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.solicitudes', 'estado', 'update'),
  'authenticated tiene UPDATE de solicitudes.estado'
);

select ok(
  not has_column_privilege('authenticated', 'public.solicitudes', 'olla_destino_id', 'update'),
  'authenticated NO tiene UPDATE de solicitudes.olla_destino_id'
);

-- ---------------------------------------------------------------------------
-- 2. Cocinera de P: precios y servicios en SU olla.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.precios (olla_id, insumo_id, canal, unidad, precio, fecha, fuente)
    values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'zz-arroz-p', 'minorista', 'g', 510000, '2026-11-23', 'test-005')$$,
  'cocinera P: inserta un precio en su olla'
);

select is(
  (select count(*) from public.precios where fuente = 'test-005'),
  1::bigint,
  'cocinera P: el precio quedó en la serie'
);

select lives_ok(
  $$insert into public.servicios (olla_id, fecha, tipo, device_id)
    values ('aaaaaaaa-0000-4000-8000-0000000000d1', '2026-11-23', 'almuerzo', 'dev-p')$$,
  'cocinera P: registra el servicio del día en su olla'
);

-- Cocinera de P intentando escribir en la olla Q (mismo rol, otra olla).
select throws_ok(
  $$insert into public.precios (olla_id, insumo_id, canal, unidad, precio, fecha, fuente)
    values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'zz-arroz-q', 'minorista', 'g', 510000, '2026-11-23', 'test-005-q')$$,
  '42501', null,
  'cocinera P: insertar un precio en la olla Q lanza 42501 (policy)'
);

select throws_ok(
  $$insert into public.servicios (olla_id, fecha, tipo, device_id)
    values ('aaaaaaaa-0000-4000-8000-0000000000d2', '2026-11-23', 'almuerzo', 'dev-q')$$,
  '42501', null,
  'cocinera P: registrar un servicio en la olla Q lanza 42501 (policy)'
);

-- La cocinera no administra solicitudes: la frontera es el rol.
select throws_ok(
  $$insert into public.solicitudes (olla_origen_id, olla_destino_id, device_id)
    values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000d3', 'dev-p')$$,
  '42501', null,
  'cocinera P: crear una solicitud lanza 42501 (administra la organizadora)'
);

-- ---------------------------------------------------------------------------
-- 3. Organizadora de P: crea el pedido en `borrador` desde su olla.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.solicitudes (id, olla_origen_id, olla_destino_id, device_id)
    values ('cccccccc-0000-4000-8000-0000000000b1',
            'aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-0000000000d3', 'dev-p')$$,
  'organizadora P: crea la solicitud desde su olla'
);

select is(
  (select estado from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000b1'),
  'borrador',
  'organizadora P: la solicitud nace en borrador'
);

select lives_ok(
  $$insert into public.solicitud_items (solicitud_id, insumo_id, cantidad, unidad)
    values ('cccccccc-0000-4000-8000-0000000000b1', 'zz-arroz-p', 5, 'kg')$$,
  'organizadora P: agrega un ítem a su solicitud'
);

select throws_ok(
  $$insert into public.solicitudes (olla_origen_id, olla_destino_id, device_id)
    values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'dev-q')$$,
  '42501', null,
  'organizadora P: crear una solicitud desde la olla Q lanza 42501 (policy)'
);

select throws_ok(
  $$insert into public.solicitud_items (solicitud_id, insumo_id, cantidad, unidad)
    values ('cccccccc-0000-4000-8000-0000000000a1', 'zz-arroz-q', 2, 'kg')$$,
  '42501', null,
  'organizadora P: agregar ítems a una solicitud ajena lanza 42501'
);

-- ---------------------------------------------------------------------------
-- 4. UPDATE de solo `estado`.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'cccccccc-0000-4000-8000-0000000000b1'$$,
  'organizadora P: envía su solicitud (UPDATE de estado)'
);

select is(
  (select estado from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000b1'),
  'enviada',
  'organizadora P: el estado quedó en enviada'
);

select throws_ok(
  $$update public.solicitudes set olla_destino_id = 'aaaaaaaa-0000-4000-8000-0000000000d2'
    where id = 'cccccccc-0000-4000-8000-0000000000b1'$$,
  '42501', null,
  'organizadora P: UPDATE de olla_destino_id lanza 42501 (column-grant)'
);

select throws_ok(
  $$update public.solicitudes set estado = 'cancelada', lamport = 99
    where id = 'cccccccc-0000-4000-8000-0000000000b1'$$,
  '42501', null,
  'organizadora P: UPDATE de estado junto a otra columna lanza 42501 (column-grant)'
);

-- La solicitud ajena (Q -> P): la organizadora de P es su destino, así que la
-- policy la filtra por `olla_destino_id` y `app.mi_rol(olla_destino_id)` es
-- `organizadora`: la deja pasar. Es el lado que acepta. `solicitudes_select`
-- ya se la muestra (es destino).
select is(
  (select count(*) from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000a1'),
  1::bigint,
  'organizadora P (destino): ve la solicitud de Q dirigida a su olla'
);

-- La cocinera de Q (rol `cocinera`, no organizadora) intenta mover el pedido.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

with tocadas as (
  update public.solicitudes set estado = 'borrador'
  where id = 'cccccccc-0000-4000-8000-0000000000a1'
  returning id
)
select is(
  (select count(*) from tocadas),
  0::bigint,
  'cocinera Q: UPDATE de estado afecta 0 filas (RLS por rol)'
);

-- La organizadora de R (olla sin relación): 0 filas.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000005","role":"authenticated"}', true);

with tocadas as (
  update public.solicitudes set estado = 'borrador'
  where id = 'cccccccc-0000-4000-8000-0000000000a1'
  returning id
)
select is(
  (select count(*) from tocadas),
  0::bigint,
  'organizadora R: UPDATE de estado afecta 0 filas (ola ajena)'
);

-- La organizadora de P (destino): acepta.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

with tocadas as (
  update public.solicitudes set estado = 'aceptada'
  where id = 'cccccccc-0000-4000-8000-0000000000a1'
  returning id
)
select is(
  (select count(*) from tocadas),
  1::bigint,
  'organizadora P (destino): acepta la solicitud (1 fila)'
);

-- La organizadora de Q (origen) NO entrega: la entrega es del lado destino
-- (máquina de estados del servidor, migración 191010; `ORIGENES_VALIDOS` del
-- dominio). Intenta y recibe 42501: el pedido sigue en `aceptada`.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select throws_ok(
  $$update public.solicitudes set estado = 'entregada'
    where id = 'cccccccc-0000-4000-8000-0000000000a1'$$,
  '42501', null,
  'organizadora Q (origen): entregar lanza 42501 (es del lado destino)'
);

select is(
  (select estado from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000a1'),
  'aceptada',
  'organizadora Q: el intento no cambió el estado (sigue aceptada)'
);

-- La organizadora de P (destino): la entrega.
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

with tocadas as (
  update public.solicitudes set estado = 'entregada'
  where id = 'cccccccc-0000-4000-8000-0000000000a1'
  returning id
)
select is(
  (select count(*) from tocadas),
  1::bigint,
  'organizadora P (destino): entrega la solicitud (1 fila)'
);

select is(
  (select estado from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000a1'),
  'entregada',
  'organizadora P (destino): el estado final es entregada'
);

-- ---------------------------------------------------------------------------
-- 5. Nada de DELETE (append-only): 42501 en las tres tablas.
--
--    RLS protege de borrar lo ajeno, no de borrar lo propio: con DELETE
--    permitido a `authenticated` (el `grant all` de Supabase), un DELETE sobre
--    filas de la propia olla afectaría N filas sin lanzar. Por eso la migración
--    revoca DELETE en las tres tablas; el error aquí es de privilegio (42501),
--    que es la frontera real del append-only.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$delete from public.precios where fuente = 'test-005'$$,
  '42501', null,
  'organizadora P: DELETE de precios lanza 42501 (append-only)'
);

select throws_ok(
  $$delete from public.servicios where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$,
  '42501', null,
  'organizadora P: DELETE de servicios lanza 42501 (append-only)'
);

select throws_ok(
  $$delete from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000b1'$$,
  '42501', null,
  'organizadora P: DELETE de solicitudes lanza 42501 (append-only)'
);

select throws_ok(
  $$delete from public.solicitud_items where solicitud_id = 'cccccccc-0000-4000-8000-0000000000b1'$$,
  '42501', null,
  'organizadora P: DELETE de solicitud_items lanza 42501 (append-only)'
);

-- `truncate` no es un delete de filas: salta la RLS y borra la tabla entera.
select throws_ok(
  $$truncate public.precios$$,
  '42501', null,
  'organizadora P: TRUNCATE de precios lanza 42501 (append-only)'
);

-- Control final: la organizadora de P sigue viendo su solicitud.
select is(
  (select count(*) from public.solicitudes where id = 'cccccccc-0000-4000-8000-0000000000b1'),
  1::bigint,
  'organizadora P: su solicitud sigue legible tras las pruebas'
);

select * from finish();

rollback;
