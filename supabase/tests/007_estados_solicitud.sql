-- 007_estados_solicitud.sql — #58: la máquina de estados la valida el servidor.
--
-- Criterios (ADR-0007, `packages/domain/src/solicitud.ts` ORIGENES_VALIDOS):
--   1. origen: `borrador -> enviada` ok; `cancelada` desde `borrador|enviada|aceptada` ok.
--   2. destino: `enviada -> aceptada` ok; `aceptada -> entregada` ok.
--   3. cualquier otro par (saltos) o el lado incorrecto -> 42501.
--   4. `entregada` y `cancelada` son terminales: ningún UPDATE posterior pasa.
--
-- Autocontenido (patrón 005): crea ollas, members, devices y solicitudes con
-- uuid fijos; no depende del seed. Rojo→verde se hace deshabilitando el trigger
-- (`alter table public.solicitudes disable trigger solicitudes_estados`) y
-- volviendo a `db reset`.
--
-- El runner corre cada sentencia como tarea suelta de la MISMA transacción y
-- `set local role` persiste; dentro de `throws_ok` el `set local role` va
-- DENTRO del bloque (la tarea es otra).

begin;

set local search_path to extensions, pg_temp, public;

select plan(21);

-- ---------------------------------------------------------------------------
-- Fixtures: olla O (origen del pedido, con organizadora y una admin que es
-- admin de O y D), olla D (destino, con organizadora) y olla X (ajena).
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'olla O (test 007)', 'ZZC2TT', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'olla D (test 007)', 'ZZC3TT', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-0000000000e3', 'olla X (test 007)', 'ZZC4TT', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f6', 'hash-organiza-o', 'rec-organiza-o'),
  ('bbbbbbbb-0000-4000-8000-0000000000f7', 'hash-organiza-d', 'rec-organiza-d'),
  ('bbbbbbbb-0000-4000-8000-0000000000f8', 'hash-admin-od',  'rec-admin-od'),
  ('bbbbbbbb-0000-4000-8000-0000000000f9', 'hash-organiza-x', 'rec-organiza-x');

insert into devices (user_id, member_id)
values
  ('80000000-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-0000000000f6'),
  ('80000000-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-0000000000f7'),
  ('80000000-0000-4000-8000-000000000008', 'bbbbbbbb-0000-4000-8000-0000000000f8'),
  ('80000000-0000-4000-8000-000000000009', 'bbbbbbbb-0000-4000-8000-0000000000f9');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f6', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000f7', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000f8', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'admin'),
  ('bbbbbbbb-0000-4000-8000-0000000000f8', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'admin'),
  ('bbbbbbbb-0000-4000-8000-0000000000f9', 'aaaaaaaa-0000-4000-8000-0000000000e3', 'organizadora');

-- Solicitudes base, en el estado inicial de cada caso. Insertamos como
-- `postgres` (dueño): el trigger es BEFORE UPDATE, no afecta el INSERT.
insert into solicitudes (id, olla_origen_id, olla_destino_id, estado, device_id)
values
  -- O -> D, borrador (casos de origen)
  ('dddddddd-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'borrador', 'dev-o'),
  -- O -> D, borrador (salto directo a entregada)
  ('dddddddd-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'borrador', 'dev-o'),
  -- O -> D, enviada (aceptar, cancelar)
  ('dddddddd-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'enviada',  'dev-o'),
  ('dddddddd-0000-4000-8000-0000000000e4', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'enviada',  'dev-o'),
  -- O -> D, aceptada (entregar, retroceder, cancelar)
  ('dddddddd-0000-4000-8000-0000000000e6', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'aceptada', 'dev-o'),
  ('dddddddd-0000-4000-8000-0000000000e7', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'aceptada', 'dev-o'),
  ('dddddddd-0000-4000-8000-0000000000e8', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'aceptada', 'dev-o'),
  -- O -> D, cancelada (terminal)
  ('dddddddd-0000-4000-8000-0000000000e9', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'cancelada', 'dev-o'),
  -- O -> D, entregada (terminal)
  ('dddddddd-0000-4000-8000-0000000000ea', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'entregada', 'dev-o'),
  -- O -> D, borrador (la cancela la organizadora de origen)
  ('dddddddd-0000-4000-8000-0000000000eb', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'borrador', 'dev-o'),
  -- O -> D, para el admin de ambos lados
  ('dddddddd-0000-4000-8000-0000000000ec', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'borrador', 'dev-o');

-- ---------------------------------------------------------------------------
-- 1. Organizadora de ORIGEN.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000006","role":"authenticated"}', true);

select lives_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'dddddddd-0000-4000-8000-0000000000e1'$$,
  'origen: borrador -> enviada pasa'
);

select throws_ok(
  $$update public.solicitudes set estado = 'aceptada'
    where id = 'dddddddd-0000-4000-8000-0000000000e2'$$,
  '42501', null,
  'origen: borrador -> aceptada lanza 42501 (transición de destino)'
);

select throws_ok(
  $$update public.solicitudes set estado = 'entregada'
    where id = 'dddddddd-0000-4000-8000-0000000000e2'$$,
  '42501', null,
  'origen: borrador -> entregada lanza 42501 (salto)'
);

-- Lado incorrecto: la organizadora de ORIGEN intenta aceptar.
select throws_ok(
  $$update public.solicitudes set estado = 'aceptada'
    where id = 'dddddddd-0000-4000-8000-0000000000e3'$$,
  '42501', null,
  'origen: enviada -> aceptada lanza 42501 (es del lado destino)'
);

-- Lado incorrecto: la de origen intenta entregar.
select throws_ok(
  $$update public.solicitudes set estado = 'entregada'
    where id = 'dddddddd-0000-4000-8000-0000000000e6'$$,
  '42501', null,
  'origen: aceptada -> entregada lanza 42501 (es del lado destino)'
);

-- Cancelar sí es suyo, desde borrador, enviada y aceptada.
select lives_ok(
  $$update public.solicitudes set estado = 'cancelada'
    where id = 'dddddddd-0000-4000-8000-0000000000eb'$$,
  'origen: cancelar desde borrador pasa'
);

select lives_ok(
  $$update public.solicitudes set estado = 'cancelada'
    where id = 'dddddddd-0000-4000-8000-0000000000e4'$$,
  'origen: cancelar desde enviada pasa'
);

select lives_ok(
  $$update public.solicitudes set estado = 'cancelada'
    where id = 'dddddddd-0000-4000-8000-0000000000e7'$$,
  'origen: cancelar desde aceptada pasa'
);

select is(
  (select estado from public.solicitudes where id = 'dddddddd-0000-4000-8000-0000000000eb'),
  'cancelada',
  'origen: la solicitud quedó cancelada'
);

-- Terminales.
select throws_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'dddddddd-0000-4000-8000-0000000000e9'$$,
  '42501', null,
  'origen: cancelada -> enviada lanza 42501 (terminal)'
);

select throws_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'dddddddd-0000-4000-8000-0000000000ea'$$,
  '42501', null,
  'origen: entregada -> enviada lanza 42501 (terminal)'
);

-- ---------------------------------------------------------------------------
-- 2. Organizadora de DESTINO.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000007","role":"authenticated"}', true);

select lives_ok(
  $$update public.solicitudes set estado = 'aceptada'
    where id = 'dddddddd-0000-4000-8000-0000000000e3'$$,
  'destino: enviada -> aceptada pasa'
);

select is(
  (select estado from public.solicitudes where id = 'dddddddd-0000-4000-8000-0000000000e3'),
  'aceptada',
  'destino: la solicitud quedó aceptada'
);

select lives_ok(
  $$update public.solicitudes set estado = 'entregada'
    where id = 'dddddddd-0000-4000-8000-0000000000e6'$$,
  'destino: aceptada -> entregada pasa'
);

-- Lado incorrecto: la de destino intenta ENVIAR un pedido que sigue en
-- borrador. El par `borrador -> enviada` es de origen; el lado de destino no
-- puede ejecutarlo aunque la policy le deje tocar la fila (es su destino).
-- La solicitud de la olla X no sirve acá (RLS la filtra): usamos una del par
-- O -> D en borrador. La e2 quedó en borrador (los saltos de arriba dieron
-- 42501).
select throws_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'dddddddd-0000-4000-8000-0000000000e2'$$,
  '42501', null,
  'destino: borrador -> enviada lanza 42501 (es del lado origen)'
);

-- Retroceso desde aceptada: no está en la tabla.
select throws_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'dddddddd-0000-4000-8000-0000000000e8'$$,
  '42501', null,
  'destino: aceptada -> enviada lanza 42501 (retroceso)'
);

-- ---------------------------------------------------------------------------
-- 3. Organizadora ajena (olla X): RLS ya la deja fuera; el trigger no la salva
--    pero tampoco deja pasar una transición válida por su boca.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000009","role":"authenticated"}', true);

with tocadas as (
  update public.solicitudes set estado = 'enviada'
  where id = 'dddddddd-0000-4000-8000-0000000000e5'
  returning id
)
select is(
  (select count(*) from tocadas),
  0::bigint,
  'organizadora ajena: 0 filas (RLS, no el trigger)'
);

-- ---------------------------------------------------------------------------
-- 4. Admin de AMBAS ollas: por cualquiera de los dos lados.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000008","role":"authenticated"}', true);

select lives_ok(
  $$update public.solicitudes set estado = 'enviada'
    where id = 'dddddddd-0000-4000-8000-0000000000ec'$$,
  'admin (ambas ollas): borrador -> enviada pasa (lado origen)'
);

select lives_ok(
  $$update public.solicitudes set estado = 'aceptada'
    where id = 'dddddddd-0000-4000-8000-0000000000ec'$$,
  'admin (ambas ollas): enviada -> aceptada pasa (lado destino)'
);

select lives_ok(
  $$update public.solicitudes set estado = 'entregada'
    where id = 'dddddddd-0000-4000-8000-0000000000ec'$$,
  'admin (ambas ollas): aceptada -> entregada pasa (lado destino)'
);

select throws_ok(
  $$update public.solicitudes set estado = 'borrador'
    where id = 'dddddddd-0000-4000-8000-0000000000ec'$$,
  '42501', null,
  'admin (ambas ollas): entregada -> borrador lanza 42501 (terminal)'
);

select * from finish();

rollback;
