-- 003_sync_pull_salud.sql — #4: `sync-pull` no entrega los flags de salud.
--
-- `sync-pull` devuelve el `payload` de `evento_sync` tal cual y la policy
-- `evento_sync_select` filtra por olla, no por rol: una cocinera leyendo
-- `v_evento_sync_pull` (o GET /sync/pull) recibía `anemia`/`pesoKg`/`tallaCm`/
-- `notas` de las personas de su olla. La vista sanea el payload en el servidor.
--
-- Se testea la vista, NO el TS: si el payload sale saneado de la query, el
-- handler no puede reensuciarlo (solo re-mapea columnas). Rojo si se quita el
-- `case ... - 'anemia' ...` de la migración.
--
-- Mismo runner que 002: sentencias sueltas dentro de una transacción; el rol se
-- ajusta con `set local role` y persiste hasta `reset role`.

begin;

set local search_path to extensions, pg_temp, public;

select plan(6);

insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-000000000003', 'olla C (test 003)', 'ZZZZA4', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'olla D (test 003)', 'ZZZZA5', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'hash-cocinera-c', 'rec-cocinera-c'),
  ('bbbbbbbb-0000-4000-8000-0000000000e2', 'hash-nutri-c', 'rec-nutri-c'),
  ('bbbbbbbb-0000-4000-8000-0000000000e3', 'hash-organiza-c', 'rec-organiza-c');

insert into devices (user_id, member_id)
values
  ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-0000-4000-8000-0000000000e1'),
  ('66666666-6666-4666-8666-666666666666', 'bbbbbbbb-0000-4000-8000-0000000000e2'),
  ('77777777-7777-4777-8777-777777777777', 'bbbbbbbb-0000-4000-8000-0000000000e3');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000003', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000003', 'nutricionista'),
  ('bbbbbbbb-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-000000000003', 'organizadora');

-- Outbox: un evento de personas con todos los flags, uno de movimientos
-- (no se toca) y uno de personas en otra olla (para probar el corte por olla).
insert into evento_sync (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, creado_en)
values
  ('dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000001', 1, 'dev-c1',
   'aaaaaaaa-0000-4000-8000-000000000003', 'personas',
   '{"codigoP":"P-ZY01","anemia":"si","pesoKg":18.5,"tallaCm":110,"notas":"alergia","categoria":"nino"}'::jsonb,
   '2026-11-23T10:00:00Z'),
  ('dddddddd-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', 2, 'dev-c1',
   'aaaaaaaa-0000-4000-8000-000000000003', 'movimientos',
   '{"id":"00000000-0000-4000-8000-000000009901","delta":-1500}'::jsonb,
   '2026-11-23T10:01:00Z'),
  ('dddddddd-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000003', 3, 'dev-otra',
   'aaaaaaaa-0000-4000-8000-000000000004', 'personas',
   '{"codigoP":"P-ZY02","anemia":"si","pesoKg":60,"tallaCm":165,"notas":"otra olla"}'::jsonb,
   '2026-11-23T10:02:00Z');

-- ---------------------------------------------------------------------------
-- Cocinera de la olla C: payload de personas sin los campos de salud.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}', true);

select is(
  (select payload->>'codigoP' from public.v_evento_sync_pull
    where event_uuid = 'dddddddd-0000-4000-8000-000000000001'),
  'P-ZY01',
  'cocinera: el payload conserva el código P (el padrón sigue viajando)'
);

select ok(
  (select not (payload ? 'anemia') from public.v_evento_sync_pull
    where event_uuid = 'dddddddd-0000-4000-8000-000000000001'),
  'cocinera: el payload NO trae anemia'
);

select ok(
  (select not (payload ? 'pesoKg') and not (payload ? 'tallaCm') and not (payload ? 'notas')
   from public.v_evento_sync_pull
   where event_uuid = 'dddddddd-0000-4000-8000-000000000001'),
  'cocinera: el payload NO trae pesoKg, tallaCm ni notas'
);

select is(
  (select payload->>'delta' from public.v_evento_sync_pull
    where event_uuid = 'dddddddd-0000-4000-8000-000000000002'),
  '-1500',
  'cocinera: los eventos que no son de personas llegan intactos'
);

select is(
  (select count(*) from public.v_evento_sync_pull
    where event_uuid = 'dddddddd-0000-4000-8000-000000000003'),
  0::bigint,
  'cocinera: el evento de otra olla no aparece'
);

-- ---------------------------------------------------------------------------
-- Nutricionista de la olla C: sí recibe los flags (es quien los necesita).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);

select is(
  (select payload ? 'anemia' and payload ? 'pesoKg' and payload ? 'tallaCm'
   from public.v_evento_sync_pull
   where event_uuid = 'dddddddd-0000-4000-8000-000000000001'),
  true,
  'nutricionista: recibe anemia, pesoKg y tallaCm en el payload'
);

select * from finish();

reset role;

rollback;
