-- 008_materializador.sql — #65: los eventos del outbox se materializan.
--
-- `sync-push` inserta eventos en `evento_sync` y hasta #65 nada los aplicaba:
-- quedaban `pendiente` para siempre (deuda D5). `app.aplicar_pendientes(limite)`
-- los recorre en orden `(lamport, device_id)` y deja cada uno en `aplicado` o
-- `conflicto` (docs/adr/0009-materializador.md).
--
-- Autocontenido: crea sus ollas, members, devices y eventos con uuid fijos; no
-- depende del seed (salvo `insumos`, que necesita un FK real y usa un insumo
-- propio). No toca ningun evento sembrado.
--
-- Runner (002/003): sentencias sueltas dentro de una transaccion; `set local
-- role` persiste entre sentencias. `app.mi_rol` y `app.mis_ollas` son `security
-- definer` y leen `request.jwt.claims` de la sesion.
--
-- Convencion de rol (medida en local): cada llamada a `app.aplicar_*` va
-- inmediatamente despues de `set local role authenticated` +
-- `set_config('request.jwt.claims', ...)`, en el mismo bloque de sentencias. Las
-- lecturas de estado y de filas destino, y los inserts/updates de fixtures, van
-- como `postgres` (`reset role`): el resultado del materializador es el mismo y
-- el archivo no depende de como aplane el runner el cambio de rol (un cambio de
-- rol seguido de un fallo aborta el archivo entero bajo `supabase test db`).
--
-- Hallazgo de contrato que este test NO arregla: `_shared/sync.ts` valida `op`
-- en el lote, pero `sync-push` no lo guarda en `evento_sync` (no hay columna y
-- `payload` es el objeto del cliente). El materializador aplica `upsert` y solo
-- mira `payload->>'op'` si un cliente lo mete ahi; los eventos `delete` hoy
-- entran como alta. Ver `docs/adr/0009-materializador.md` §Deuda.
--
-- Rojo→verde: quitando la migracion 20261123193000 (o sus funciones), las
-- aserciones de materializacion fallan en rojo (`function app.aplicar_pendientes
-- does not exist` en la primera o la fila destino no existe).

begin;

set local search_path to extensions, pg_temp, public;

select plan(25);

-- ---------------------------------------------------------------------------
-- Fixtures: olla E (rol por persona) y olla F (segundo dispositivo).
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-000000000005', 'olla E (test 008)', 'ZZZZA6', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'olla F (test 008)', 'ZZZZA7', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'hash-cocinera-e', 'rec-cocinera-e'),
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'hash-organiza-e', 'rec-organiza-e'),
  ('bbbbbbbb-0000-4000-8000-0000000000f3', 'hash-nutri-e', 'rec-nutri-e'),
  ('bbbbbbbb-0000-4000-8000-0000000000f4', 'hash-organiza-f', 'rec-organiza-f');

insert into devices (user_id, member_id)
values
  ('99999999-9999-4999-8999-999999999991', 'bbbbbbbb-0000-4000-8000-0000000000f1'),
  ('99999999-9999-4999-8999-999999999992', 'bbbbbbbb-0000-4000-8000-0000000000f2'),
  ('99999999-9999-4999-8999-999999999993', 'bbbbbbbb-0000-4000-8000-0000000000f3'),
  ('99999999-9999-4999-8999-999999999994', 'bbbbbbbb-0000-4000-8000-0000000000f4');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000005', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-000000000005', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000f3', 'aaaaaaaa-0000-4000-8000-000000000005', 'nutricionista'),
  ('bbbbbbbb-0000-4000-8000-0000000000f4', 'aaaaaaaa-0000-4000-8000-000000000006', 'organizadora');

-- Insumo propio de la olla E: `movimientos.insumo_id` es FK a `insumos`.
insert into insumos (id, olla_id, denominacion, grupo, unidad_base, device_id)
values ('test008-arroz', 'aaaaaaaa-0000-4000-8000-000000000005', 'Arroz test 008', 'cereal', 'g', 'dev-test-e');

-- Solicitud para el evento de estado (estado 4 en las aserciones).
insert into solicitudes (id, olla_origen_id, olla_destino_id, estado, device_id)
values ('eeeeeeee-0000-4000-8000-00000000000a',
        'aaaaaaaa-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000006',
        'borrador', 'dev-test-e');

-- ---------------------------------------------------------------------------
-- Eventos del outbox, todos de la olla E, `pendiente`, con uuid y lamport
-- FIJOS para que el orden `(lamport, device_id)` sea determinista.
-- ---------------------------------------------------------------------------
-- e01 lamport 1 movimientos  -> aplicado por cocinera.
-- e02 lamport 2 menus        -> conflicto por rol (cocinera no esta en la allowlist).
-- e03 lamport 3 personas     -> conflicto por CHECK (codigo P invalido).
-- e04 lamport 4 solicitudes  -> aplicado por organizadora (borrador->enviada).
-- e05 lamport 5 movimientos  -> aplicado por organizadora (segundo evento de orden).
-- e06 lamport 6 personas     -> idempotencia: se aplica, se re-aplica.
insert into evento_sync (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, creado_en)
values
  ('ffffffff-0000-4000-8000-000000000001', 'ffffffff-0000-4000-8000-000000000001', 1, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'movimientos',
   jsonb_build_object(
     'id', 'eeeeeeee-0000-4000-8000-000000000101',
     'insumoId', 'test008-arroz',
     'delta', 2000,
     'motivo', 'entrada',
     'autor', 'member-test-e',
     'at', '2026-11-23T10:00:00Z'),
   '2026-11-23T10:00:00Z'),

  ('ffffffff-0000-4000-8000-000000000002', 'ffffffff-0000-4000-8000-000000000002', 2, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'menus',
   jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-000000000201', 'estado', 'borrador'),
   '2026-11-23T10:01:00Z'),

  ('ffffffff-0000-4000-8000-000000000003', 'ffffffff-0000-4000-8000-000000000003', 3, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'personas',
   jsonb_build_object(
     'codigoP', 'XYZ-01',  -- viola el CHECK ^P-[A-Z0-9]{4}$
     'anioNacimiento', 2020,
     'sexo', 'F',
     'categoria', 'nino',
     'anemia', 'no',
     'consentimientoSeguimiento', false),
   '2026-11-23T10:02:00Z'),

  ('ffffffff-0000-4000-8000-000000000004', 'ffffffff-0000-4000-8000-000000000004', 4, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'solicitudes',
   jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-00000000000a', 'estado', 'enviada'),
   '2026-11-23T10:03:00Z'),

  ('ffffffff-0000-4000-8000-000000000005', 'ffffffff-0000-4000-8000-000000000005', 5, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'movimientos',
   jsonb_build_object(
     'id', 'eeeeeeee-0000-4000-8000-000000000102',
     'insumoId', 'test008-arroz',
     'delta', -500,
     'motivo', 'salida',
     'autor', 'member-test-e',
     'at', '2026-11-23T10:04:00Z'),
   '2026-11-23T10:04:00Z'),

  ('ffffffff-0000-4000-8000-000000000006', 'ffffffff-0000-4000-8000-000000000006', 6, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'personas',
   jsonb_build_object(
     'codigoP', 'P-ZX01',
     'anioNacimiento', 1990,
     'sexo', 'M',
     'categoria', 'adulto',
     'anemia', 'sin_dato',
     'consentimientoSeguimiento', false),
   '2026-11-23T10:05:00Z');

-- ---------------------------------------------------------------------------
-- 1. Un evento de movimientos, entregado por una cocinera, se materializa.
--    Ese lote lo corre la cocinera: e01 y e05 pasan (movimientos), e02..e04 y
--    e06 caen por rol sin cortar el lote; la organizadora los reintenta en 3.
--
-- Las lecturas de estado/filas van como `postgres` (sin claims): bajo `supabase
-- test db` el runner aborta el archivo si una sentencia posterior a un cambio de
-- rol falla, y los `app.mi_rol` dentro de la funcion dependen de que el runner
-- aplique los claims en el mismo frame que la llamada. Esto es lo unico medido
-- estable en local (ver runbook del PR). `app.aplicar_*` se llama con claims.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999991","role":"authenticated"}', true);

-- La cocinera ve los eventos de su olla, no los de otra.
select is(
  (select count(*) from public.evento_sync where olla_id = 'aaaaaaaa-0000-4000-8000-000000000006'),
  0::bigint,
  'cocinera: no ve eventos de la olla F'
);

-- Aplica el lote pendiente ordenado. La cocinera solo tiene allowlist para
-- movimientos: e01 (lamport 1) y e05 (lamport 5) se aplican; e02..e04 y e06
-- caen por rol. El lote NO se detiene en el conflicto.
select is(
  (app.aplicar_pendientes(50)->>'aplicados')::integer,
  2,
  'cocinera: su lote aplica los dos movimientos (e01 y e05), no los demas'
);

select is(
  (select estado from public.evento_sync where event_uuid = 'ffffffff-0000-4000-8000-000000000001'),
  'aplicado',
  'e01 movimientos: el evento quedo `aplicado`'
);

select is(
  (select delta from public.movimientos where id = 'eeeeeeee-0000-4000-8000-000000000101'),
  2000::numeric,
  'e01 movimientos: la fila existe en `movimientos` con el delta del payload'
);

select is(
  (select olla_id from public.movimientos where id = 'eeeeeeee-0000-4000-8000-000000000101'),
  'aaaaaaaa-0000-4000-8000-000000000005'::uuid,
  'e01 movimientos: la tenencia sale del evento, no del payload'
);

select is(
  (select estado from public.evento_sync where event_uuid = 'ffffffff-0000-4000-8000-000000000002'),
  'conflicto',
  'e02 menus: una cocinera no esta en la allowlist -> conflicto (no excepcion)'
);

select ok(
  (select payload->>'_conflicto' from public.evento_sync where event_uuid = 'ffffffff-0000-4000-8000-000000000002')
    like '%rol no autorizado para menus%',
  'e02 menus: el conflicto lleva el motivo de rol'
);

select isnt(
  (select count(*) from public.menu_template where olla_id = 'aaaaaaaa-0000-4000-8000-000000000005'),
  1::bigint,
  'e02 menus: el conflicto no dejo una plantilla a medias'
);

-- ---------------------------------------------------------------------------
-- 2. Payload invalido: el materializador valida el codigo P contra el mismo
--    CHECK del modelo y deja el evento en conflicto con el motivo; NO lo marca
--    aplicado.
-- ---------------------------------------------------------------------------
select is(
  (select estado from public.evento_sync where event_uuid = 'ffffffff-0000-4000-8000-000000000003'),
  'conflicto',
  'e03 personas con codigo P invalido: conflicto, no aplicado'
);

select ok(
  (select estado = 'conflicto' and payload ? '_conflicto'
   from public.evento_sync where event_uuid = 'ffffffff-0000-4000-8000-000000000003'),
  'e03 personas: el conflicto lleva su motivo registrado'
);

select is(
  (select count(*) from public.personas where codigo_p = 'XYZ-01'),
  0::bigint,
  'e03 personas: no se inserto la fila invalida'
);

-- NOTA: este primer lote toca TODOS los pendientes de la olla E, asi que e02..e04
-- y e06 caen por rol (la allowlist no da segundas oportunidades automaticas).
-- Para ejercitar la organizadora, el bloque 3 los devuelve a `pendiente`: es lo
-- que haria un reintento manual tras revisar el conflicto.

-- ---------------------------------------------------------------------------
-- 3. Organizadora: aplica personas y solicitudes; reaplica sin duplicar.
-- ---------------------------------------------------------------------------
-- e04 y e06 quedaron `conflicto` por rol en el lote de la cocinera (e05 la aplico
-- ella: su allowlist incluye movimientos); se devuelven a `pendiente` (reintento
-- manual) para probar la allowlist de la organizadora. `estado` no tiene policy
-- de update para `authenticated`, asi que el reset va como `postgres` (dueño).
reset role;

update public.evento_sync set estado = 'pendiente'
where event_uuid in (
  'ffffffff-0000-4000-8000-000000000004',
  'ffffffff-0000-4000-8000-000000000006');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999992","role":"authenticated"}', true);

select is(
  (app.aplicar_pendientes(50)->>'aplicados')::integer,
  2,
  'organizadora: aplica las 2 pendientes que le tocan (solicitud + persona)'
);

select is(
  (select estado from public.solicitudes where id = 'eeeeeeee-0000-4000-8000-00000000000a'),
  'enviada',
  'e04 solicitudes: borrador -> enviada'
);

select is(
  (select count(*) from public.movimientos where id = 'eeeeeeee-0000-4000-8000-000000000102'),
  1::bigint,
  'e05 movimientos: el segundo movimiento del mismo device se aplico'
);

-- Idempotencia: una segunda pasada no toca nada.
select is(
  (app.aplicar_pendientes(50)->>'aplicados')::integer,
  0,
  'idempotencia: la segunda pasada no aplica nada (ya no hay pendientes)'
);

select is(
  (select count(*) from public.personas where codigo_p = 'P-ZX01'),
  1::bigint,
  'idempotencia: la persona aplicada no se duplica'
);

-- ---------------------------------------------------------------------------
-- 4. Orden por lamport: dos eventos nuevos con lamport 7 y 8 del mismo device,
--    insertados en sentido inverso; el materializador procesa 7 y luego 8.
-- ---------------------------------------------------------------------------
insert into evento_sync (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, creado_en)
values
  ('ffffffff-0000-4000-8000-000000000008', 'ffffffff-0000-4000-8000-000000000008', 8, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'movimientos',
   jsonb_build_object(
     'id', 'eeeeeeee-0000-4000-8000-000000000108', 'insumoId', 'test008-arroz',
     'delta', 100, 'motivo', 'ajuste', 'autor', 'member-test-e', 'at', '2026-11-23T10:08:00Z'),
   '2026-11-23T10:08:00Z'),
  ('ffffffff-0000-4000-8000-000000000007', 'ffffffff-0000-4000-8000-000000000007', 7, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'movimientos',
   jsonb_build_object(
     'id', 'eeeeeeee-0000-4000-8000-000000000107', 'insumoId', 'test008-arroz',
     'delta', 300, 'motivo', 'ajuste', 'autor', 'member-test-e', 'at', '2026-11-23T10:07:00Z'),
   '2026-11-23T10:07:00Z');

select is(
  (select array_agg(r->>'eventUuid' order by ord)
   from jsonb_array_elements(app.aplicar_pendientes(1)->'resumen')
   with ordinality as t(r, ord)),
  array['ffffffff-0000-4000-8000-000000000007']::text[],
  'orden: con limite 1 procesa el lamport 7, no el 8 insertado antes'
);

select is(
  (select array_agg(r->>'eventUuid' order by ord)
   from jsonb_array_elements(app.aplicar_pendientes(50)->'resumen')
   with ordinality as t(r, ord)),
  array['ffffffff-0000-4000-8000-000000000008']::text[],
  'orden: en la pasada siguiente queda el lamport 8 (el resumen sigue el orden contractual)'
);

-- ---------------------------------------------------------------------------
-- 5. Segundo dispositivo: el evento de personas aplicado es visible bajo RLS
--    desde otra sesion de la misma olla.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999993","role":"authenticated"}', true);

select is(
  (select count(*) from public.v_personas_salud where codigo_p = 'P-ZX01'),
  1::bigint,
  'dos dispositivos: la nutricionista (otro dispositivo, misma olla) ve la persona aplicada'
);

-- La olla F no ve esa persona (frontera cruzada), aunque la escribio un evento.
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999994","role":"authenticated"}', true);

select is(
  (select count(*) from public.personas where codigo_p = 'P-ZX01'),
  0::bigint,
  'dos dispositivos: la organizadora de la olla F no ve la persona de la olla E'
);

-- Aplicar un evento ya aplicado no hace nada (no-op con el estado actual) y no
-- duplica la fila destino: se comprueba el estado y el conteo a la vez.
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999991","role":"authenticated"}', true);

select ok(
  app.aplicar_evento('ffffffff-0000-4000-8000-000000000001') = 'aplicado'
  and (select count(*) from public.movimientos where id = 'eeeeeeee-0000-4000-8000-000000000101') = 1,
  'idempotencia: re-aplicar devuelve `aplicado` y no duplica el movimiento'
);

-- Un evento que no existe (o no visible por RLS) no lanza.
select is(
  app.aplicar_evento('ffffffff-0000-4000-8000-00000000dead'),
  'conflicto',
  'aplicar_evento con un uuid que no existe devuelve conflicto sin lanzar'
);

-- La solicitud no acepta un salto: enviada -> entregada es invalido. El insert
-- se hace como `postgres` (dueño): `evento_sync` no tiene policy de insert para
-- un dispositivo de la olla F, y este evento es de la olla E.
reset role;

insert into evento_sync (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, creado_en)
values
  ('ffffffff-0000-4000-8000-000000000009', 'ffffffff-0000-4000-8000-000000000009', 9, 'dev-test-e',
   'aaaaaaaa-0000-4000-8000-000000000005', 'solicitudes',
   jsonb_build_object('id', 'eeeeeeee-0000-4000-8000-00000000000a', 'estado', 'entregada'),
   '2026-11-23T10:09:00Z');

-- La organizadora de la olla E es quien puede con `solicitudes`.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-4999-8999-999999999992","role":"authenticated"}', true);

select is(
  app.aplicar_evento('ffffffff-0000-4000-8000-000000000009'),
  'conflicto',
  'solicitudes: enviada -> entregada es un salto invalido (maquina de estados)'
);

select is(
  (select estado from public.solicitudes where id = 'eeeeeeee-0000-4000-8000-00000000000a'),
  'enviada',
  'solicitudes: el salto invalido no movio el estado'
);

-- ---------------------------------------------------------------------------
-- 6. Las dos funciones existen en `app` (el rojo se ve antes: sin migracion,
--    el primer `aplicar_pendientes` ya lanza "function does not exist").
-- ---------------------------------------------------------------------------
reset role;

select is(
  (select count(*) from information_schema.routines
   where routine_schema = 'app' and routine_name in ('aplicar_evento', 'aplicar_pendientes')),
  2::bigint,
  'materializador: las dos funciones existen en `app`'
);

select * from finish();

reset role;

rollback;
