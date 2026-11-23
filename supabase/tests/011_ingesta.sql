-- 011_ingesta.sql — #83: capturas (audio/boleta) con RLS por olla.
--
-- Criterios del issue, uno por bloque:
--   1. La olla A no ve capturas de la olla B (fuga cruzada, mismo rol).
--   2. INSERT propio en su olla: OK. INSERT en la olla ajena: 0 filas (42501).
--   3. `embedding extensions.vector(1024)` acepta 1024 dim y rechaza otra.
--   4. `captura_item` con `precio_unitario_microcent` null y un item `porRevisar`
--      (importe dudoso -> precio null).
--   5. El miembro de la olla actualiza el estado de su captura; la captura
--      ajena no aparece en su UPDATE; DELETE lanza 42501.
--
-- Autocontenido (mismo patron que 002/005): crea ollas, members y devices con
-- uuid fijos; no depende del seed. Rojo->verde se hace revirtiendo la policy
-- de SELECT de `captura` en `20261123196000_ingesta.sql` a mano y corriendo la
-- suite: el bloque "olla A no ve capturas de B" se pone rojo.
--
-- El runner corre cada sentencia como tarea suelta de la MISMA transaccion y
-- `set local role` persiste; dentro de `throws_ok` el `set local role` va DENTRO
-- del bloque (la tarea es otra).

begin;

set local search_path to extensions, pg_temp, public;

select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures: olla A (donde trabaja el usuario A) y olla B (la ajena).
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'olla A (test 011)', 'ZZC2TT', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'olla B (test 011)', 'ZZC3TT', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'hash-a', 'rec-a'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'hash-b', 'rec-b');

insert into devices (user_id, member_id)
values
  ('90000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000a1'),
  ('90000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000a2');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'cocinera');

-- Una captura en la olla B, sembrada como `postgres` (dueño de la tabla), para
-- que el usuario de A intente leerla/actualizarla.
insert into captura (id, olla_id, device_id, tipo, storage_path, estado, texto)
values ('cccccccc-0000-4000-8000-0000000000b1',
        'aaaaaaaa-0000-4000-8000-0000000000e2', 'dev-b', 'audio',
        'aaaaaaaa-0000-4000-8000-0000000000e2/b1.webm', 'transcrita', 'dos kilos de papa');

-- ---------------------------------------------------------------------------
-- 1. Usuario A (cocinera de A): su vista de `captura`.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.captura where id = 'cccccccc-0000-4000-8000-0000000000b1'),
  0::bigint,
  'olla A: no ve la captura de la olla B (policy SELECT por olla)'
);

select is_empty(
  $$select id from public.captura where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e2'$$,
  'olla A: ninguna captura de la olla B es visible'
);

-- INSERT propio en su olla.
select lives_ok(
  $$insert into public.captura (id, olla_id, device_id, tipo, storage_path)
    values ('cccccccc-0000-4000-8000-0000000000a1',
            'aaaaaaaa-0000-4000-8000-0000000000e1', 'dev-a', 'boleta',
            'aaaaaaaa-0000-4000-8000-0000000000e1/a1.jpg')$$,
  'olla A: inserta una captura en su olla'
);

select is(
  (select count(*) from public.captura where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'),
  1::bigint,
  'olla A: su captura quedo en la tabla'
);

-- INSERT en la olla ajena: la policy filtra la fila.
select throws_ok(
  $$insert into public.captura (olla_id, device_id, tipo, storage_path)
    values ('aaaaaaaa-0000-4000-8000-0000000000e2', 'dev-a', 'audio', 'aaaaaaaa-0000-4000-8000-0000000000e2/x.webm')$$,
  '42501', null,
  'olla A: insertar en la olla B lanza 42501 (policy)'
);

-- ---------------------------------------------------------------------------
-- 2. `embedding vector(1024)`: acepta 1024, rechaza otra dimension.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.captura
       set embedding = array_fill(0.01::real, array[1024])::extensions.vector(1024),
           embedding_modelo = 'bge-m3'
     where id = 'cccccccc-0000-4000-8000-0000000000a1'$$,
  'olla A: actualiza embedding con vector(1024)'
);

select is(
  (select vector_dims(embedding) from public.captura where id = 'cccccccc-0000-4000-8000-0000000000a1'),
  1024,
  'olla A: el embedding guardado tiene 1024 dimensiones'
);

select throws_ok(
  $$update public.captura
       set embedding = array_fill(0.01::real, array[3])::extensions.vector(3)
     where id = 'cccccccc-0000-4000-8000-0000000000a1'$$,
  '22000', null,
  'olla A: un embedding de otra dimension se rechaza (vector(1024))'
);

-- ---------------------------------------------------------------------------
-- 3. UPDATE de estado por el miembro de la olla.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$update public.captura set estado = 'categorizada'
     where id = 'cccccccc-0000-4000-8000-0000000000a1'$$,
  'olla A: avanza el estado de su captura'
);

select is(
  (select estado from public.captura where id = 'cccccccc-0000-4000-8000-0000000000a1'),
  'categorizada',
  'olla A: el estado quedo en categorizada'
);

-- La captura de B no se puede tocar desde A: el UPDATE no afecta filas.
with afectadas as (
  update public.captura set estado = 'error'
  where id = 'cccccccc-0000-4000-8000-0000000000b1'
  returning 1 as r
)
select is(
  (select count(*) from afectadas)::bigint,
  0::bigint,
  'olla A: updatear la captura de la olla B afecta 0 filas'
);

-- ---------------------------------------------------------------------------
-- 4. `captura_item`: precio null (por_revisar) y RLS por olla.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.captura_item (captura_id, linea, texto_crudo, cantidad, unidad,
                                     precio_unitario_microcent, categoria)
    values
      ('cccccccc-0000-4000-8000-0000000000a1', 1, 'arroz 1 kg 2.50', 1, 'kg', 250000000, 'cereal'),
      ('cccccccc-0000-4000-8000-0000000000a1', 2, 'producto dudoso ~?', null, null, null, null)$$,
  'olla A: inserta lineas, una con precio null (por revisar)'
);

select is(
  (select precio_unitario_microcent from public.captura_item
    where captura_id = 'cccccccc-0000-4000-8000-0000000000a1' and linea = 2),
  null,
  'olla A: la linea dudosa tiene precio_unitario_microcent null'
);

select is(
  (select precio_unitario_microcent from public.captura_item
    where captura_id = 'cccccccc-0000-4000-8000-0000000000a1' and linea = 1),
  250000000::bigint,
  'olla A: la linea con importe firme guarda su microcent'
);

select is(
  (select count(*) from public.captura_item where captura_id = 'cccccccc-0000-4000-8000-0000000000b1'),
  0::bigint,
  'olla A: no ve lineas de la captura B'
);

-- Las lineas de una captura ajena no se insertan: la policy filtra por captura.
select throws_ok(
  $$insert into public.captura_item (captura_id, linea, texto_crudo)
    values ('cccccccc-0000-4000-8000-0000000000b1', 1, 'linea ajena')$$,
  '42501', null,
  'olla A: insertar una linea en la captura B lanza 42501'
);

-- PK (captura_id, linea) impide lineas duplicadas.
select throws_ok(
  $$insert into public.captura_item (captura_id, linea, texto_crudo)
    values ('cccccccc-0000-4000-8000-0000000000a1', 1, 'duplicada')$$,
  '23505', null,
  'olla A: linea repetida en la misma captura lanza 23505 (PK)'
);

-- ---------------------------------------------------------------------------
-- 5. Sin DELETE desde el cliente (append-only).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$delete from public.captura where id = 'cccccccc-0000-4000-8000-0000000000a1'$$,
  '42501', null,
  'olla A: DELETE de captura lanza 42501 (append-only)'
);

select throws_ok(
  $$delete from public.captura_item where captura_id = 'cccccccc-0000-4000-8000-0000000000a1'$$,
  '42501', null,
  'olla A: DELETE de captura_item lanza 42501 (append-only)'
);

-- ---------------------------------------------------------------------------
-- 6. Control: el usuario de B ve SU captura y no la de A.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*) from public.captura where id = 'cccccccc-0000-4000-8000-0000000000b1'),
  1::bigint,
  'olla B: ve su propia captura'
);

select is(
  (select count(*) from public.captura where id = 'cccccccc-0000-4000-8000-0000000000a1'),
  0::bigint,
  'olla B: no ve la captura de la olla A'
);

-- Storage: la carpeta `ollas` del path de B no es accesible desde A. Se prueba
-- la funcion que arma la policy: la indexacion del prefijo es por olla_id.
select ok(
  (select (storage.foldername('aaaaaaaa-0000-4000-8000-0000000000e2/b1.webm'))[1]
          = 'aaaaaaaa-0000-4000-8000-0000000000e2'),
  'storage: el prefijo del path es el olla_id (policy por carpeta)'
);

select ok(
  ('aaaaaaaa-0000-4000-8000-0000000000e2'::uuid in (select app.mis_ollas())),
  'storage: la olla B esta en mis_ollas del usuario B (prefijo valido para subir)'
);

select * from finish();

rollback;
