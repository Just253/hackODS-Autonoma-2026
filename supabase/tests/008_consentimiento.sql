-- 008_consentimiento.sql — #74: consentimiento append-only, RLS por olla y
-- agregado solo sobre quienes consintieron.
--
-- Criterios del issue, uno por bloque:
--   1. Tabla append-only: `authenticated` tiene SELECT e INSERT, y UPDATE,
--      DELETE y TRUNCATE lanzan 42501. Revocar es una fila nueva.
--   2. RLS: un miembro ve el consentimiento de SU olla y 0 filas de otra
--      olla, aunque tenga el mismo rol allá.
--   3. Una persona de otra olla no puede entrar por la FK compuesta (23503):
--      la frontera no queda solo en la policy.
--   4. `v_salud_agregado` cuenta solo personas con `seguimiento` vigente: una
--      revocación corta el conteo al instante y, con menos de 10, el grupo se
--      suprime igual que antes de este cambio.
--   5. `evento_sync` acepta `entidad = 'consentimiento'` y sigue rechazando
--      una entidad desconocida.
--
-- Autocontenido (mismo patrón que 002/005): crea ollas, members, devices y
-- personas con uuid y códigos fijos; no depende del seed. Rojo→verde de la
-- estructura se hace sin la migración 20261123211500_consentimiento.sql; el
-- rojo del agregado, con la migración pero sin el cambio de `v_salud_agregado`.
-- El runner corre cada sentencia como tarea suelta de la MISMA transacción y
-- `set local role` persiste; dentro de `throws_ok` el cambio de rol va DENTRO
-- del bloque (la tarea es otra), y por eso cada bloque que sí necesita un rol
-- lo vuelve a fijar antes de la aserción siguiente.

begin;

set local search_path to extensions, pg_temp, public;

select plan(26);

-- ---------------------------------------------------------------------------
-- Fixtures: olla S (donde se prueba todo) y olla T (la ajena).
-- 10 niños: con k=10 el grupo es visible. 2 adultos: su grupo nunca llega a 10,
-- así que no ensucian el agregado.
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('eeeeeeee-0000-4000-8000-0000000000e1', 'olla S (test 007)', 'ZZC2TT', 'comun', 'test'),
  ('eeeeeeee-0000-4000-8000-0000000000e2', 'olla T (test 007)', 'ZZC3TT', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'hash-organiza-s', 'rec-organiza-s'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'hash-cocinera-s', 'rec-cocinera-s'),
  ('bbbbbbbb-0000-4000-8000-0000000000a3', 'hash-organiza-t', 'rec-organiza-t'),
  ('bbbbbbbb-0000-4000-8000-0000000000a4', 'hash-nutri-s', 'rec-nutri-s');

insert into devices (user_id, member_id)
values
  ('90000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000a1'),
  ('90000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000a2'),
  ('90000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-0000000000a3'),
  ('90000000-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-0000000000a4');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'eeeeeeee-0000-4000-8000-0000000000e1', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000a2', 'eeeeeeee-0000-4000-8000-0000000000e1', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000a3', 'eeeeeeee-0000-4000-8000-0000000000e2', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000a4', 'eeeeeeee-0000-4000-8000-0000000000e1', 'nutricionista');

insert into personas (codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia, peso_kg, talla_cm, device_id)
values
  ('P-XX01', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'F', 'nino', 'no', 12.00, 90.00, 'dev-s'),
  ('P-XX02', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'si', 12.10, 91.00, 'dev-s'),
  ('P-XX03', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.20, 92.00, 'dev-s'),
  ('P-XX04', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.30, 93.00, 'dev-s'),
  ('P-XX05', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.40, 94.00, 'dev-s'),
  ('P-XX06', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.50, 95.00, 'dev-s'),
  ('P-XX07', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.60, 96.00, 'dev-s'),
  ('P-XX08', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.70, 97.00, 'dev-s'),
  ('P-XX09', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'M', 'nino', 'no', 12.80, 98.00, 'dev-s'),
  ('P-XX10', 'eeeeeeee-0000-4000-8000-0000000000e1', 2020, 'F', 'nino', 'no', 12.90, 99.00, 'dev-s'),
  ('P-XX11', 'eeeeeeee-0000-4000-8000-0000000000e1', 1990, 'F', 'adulto', 'no', 60.00, 160.00, 'dev-s'),
  ('P-XX12', 'eeeeeeee-0000-4000-8000-0000000000e1', 1991, 'M', 'adulto', 'no', 70.00, 170.00, 'dev-s'),
  ('P-XX21', 'eeeeeeee-0000-4000-8000-0000000000e2', 1995, 'F', 'adulto', 'no', 62.00, 160.00, 'dev-t');

-- Firmas: los ids son UUID fijos porque el cliente los genera (D5); el
-- `lamport` ordena, no el orden de inserción.
insert into consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
values
  -- 10 niños con seguimiento otorgado (lamport 1..10).
  ('c0000000-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX01', 'seguimiento', true, 1, '2026-11-20T10:00:00Z', null, 'dev-s', 1),
  ('c0000000-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX02', 'seguimiento', true, 1, '2026-11-20T10:01:00Z', null, 'dev-s', 2),
  ('c0000000-0000-4000-8000-000000000003', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX03', 'seguimiento', true, 1, '2026-11-20T10:02:00Z', null, 'dev-s', 3),
  ('c0000000-0000-4000-8000-000000000004', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX04', 'seguimiento', true, 1, '2026-11-20T10:03:00Z', null, 'dev-s', 4),
  ('c0000000-0000-4000-8000-000000000005', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX05', 'seguimiento', true, 1, '2026-11-20T10:04:00Z', null, 'dev-s', 5),
  ('c0000000-0000-4000-8000-000000000006', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX06', 'seguimiento', true, 1, '2026-11-20T10:05:00Z', null, 'dev-s', 6),
  ('c0000000-0000-4000-8000-000000000007', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX07', 'seguimiento', true, 1, '2026-11-20T10:06:00Z', null, 'dev-s', 7),
  ('c0000000-0000-4000-8000-000000000008', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX08', 'seguimiento', true, 1, '2026-11-20T10:07:00Z', null, 'dev-s', 8),
  ('c0000000-0000-4000-8000-000000000009', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX09', 'seguimiento', true, 1, '2026-11-20T10:08:00Z', null, 'dev-s', 9),
  ('c0000000-0000-4000-8000-000000000010', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX10', 'seguimiento', true, 1, '2026-11-20T10:09:00Z', null, 'dev-s', 10),
  -- P-XX01 revoca (lamport 11): queda sin seguimiento vigente.
  ('c0000000-0000-4000-8000-000000000011', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX01', 'seguimiento', false, 1, '2026-11-21T09:00:00Z', '2026-11-21T09:00:00Z', 'dev-s', 11),
  -- Estadísticas de 4 niños (lamport 12..15): no son seguimiento.
  ('c0000000-0000-4000-8000-000000000012', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX03', 'estadisticas', true, 1, '2026-11-20T11:00:00Z', null, 'dev-s', 12),
  ('c0000000-0000-4000-8000-000000000013', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX04', 'estadisticas', true, 1, '2026-11-20T11:01:00Z', null, 'dev-s', 13),
  ('c0000000-0000-4000-8000-000000000014', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX05', 'estadisticas', true, 1, '2026-11-20T11:02:00Z', null, 'dev-s', 14),
  ('c0000000-0000-4000-8000-000000000015', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX06', 'estadisticas', true, 1, '2026-11-20T11:03:00Z', null, 'dev-s', 15),
  -- Un adulto con estadísticas pero sin seguimiento (lamport 16): no se cuenta.
  ('c0000000-0000-4000-8000-000000000016', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX11', 'estadisticas', true, 1, '2026-11-20T11:04:00Z', null, 'dev-s', 16),
  -- Otro adulto: otorga y después revoca (lamport 17 y 18).
  ('c0000000-0000-4000-8000-000000000017', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX12', 'seguimiento', true, 1, '2026-11-20T11:05:00Z', null, 'dev-s', 17),
  ('c0000000-0000-4000-8000-000000000018', 'eeeeeeee-0000-4000-8000-0000000000e1', 'P-XX12', 'seguimiento', false, 1, '2026-11-21T10:00:00Z', '2026-11-21T10:00:00Z', 'dev-s', 18),
  -- Control de la olla T: una fila, para probar que S no la ve y T sí.
  ('c0000000-0000-4000-8000-000000000019', 'eeeeeeee-0000-4000-8000-0000000000e2', 'P-XX21', 'seguimiento', true, 1, '2026-11-20T12:00:00Z', null, 'dev-t', 1);

-- ---------------------------------------------------------------------------
-- 1. Privilegios: SELECT e INSERT sí; UPDATE, DELETE y TRUNCATE no.
--    El append-only no se apoya solo en RLS (que protege lo ajeno, no lo
--    propio): se revoca desde los grants.
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'public.consentimiento', 'select'),
  'authenticated tiene SELECT de consentimiento'
);
select ok(
  has_table_privilege('authenticated', 'public.consentimiento', 'insert'),
  'authenticated tiene INSERT de consentimiento'
);
select ok(
  not has_table_privilege('authenticated', 'public.consentimiento', 'update'),
  'authenticated NO tiene UPDATE de consentimiento (append-only)'
);
select ok(
  not has_table_privilege('authenticated', 'public.consentimiento', 'delete'),
  'authenticated NO tiene DELETE de consentimiento (append-only)'
);
select ok(
  not has_table_privilege('authenticated', 'public.consentimiento', 'truncate'),
  'authenticated NO tiene TRUNCATE de consentimiento (append-only)'
);

-- ---------------------------------------------------------------------------
-- 2. RLS de lectura: la olla propia, y nada de la ajena.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.consentimiento),
  18::bigint,
  'organizadora S: ve las 18 firmas de su olla'
);

select is(
  (select count(*) from public.consentimiento where olla_id = 'eeeeeeee-0000-4000-8000-0000000000e2'),
  0::bigint,
  'organizadora S: 0 filas del consentimiento de la olla T'
);

-- Mismo rol, otra olla: el control de que el rol no abre la puerta ajena.
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*) from public.consentimiento),
  1::bigint,
  'organizadora T: control, ve la única firma de su olla'
);

select is(
  (select count(*) from public.consentimiento where olla_id = 'eeeeeeee-0000-4000-8000-0000000000e1'),
  0::bigint,
  'organizadora T: 0 filas del consentimiento de la olla S (mismo rol)'
);

-- ---------------------------------------------------------------------------
-- 3. El agregado solo cuenta seguimiento vigente.
--
--    Con P-XX01 revocada hay 9 niños con permiso vigente: k=9 < 10, así que el
--    grupo no emite fila (la regla k>=10 del repo sigue igual).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is_empty(
  'select * from public.v_salud_agregado',
  'nutricionista S: 9 niños con permiso vigente no alcanzan k>=10 (0 filas)'
);

-- Se vuelve a otorgar el seguimiento de P-XX01: 10 vigentes.
reset role;
insert into consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
values (
  'c0000000-0000-4000-8000-000000000020',
  'eeeeeeee-0000-4000-8000-0000000000e1',
  'P-XX01', 'seguimiento', true, 1, '2026-11-22T09:00:00Z', null, 'dev-s', 20
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  (select count(*) from public.v_salud_agregado),
  1::bigint,
  'nutricionista S: con 10 vigentes el grupo niño vuelve a emitir una fila'
);

select is(
  (select personas::bigint from public.v_salud_agregado where categoria = 'nino'),
  10::bigint,
  'nutricionista S: el agregado cuenta solo las 10 personas con seguimiento vigente'
);

select is(
  (select con_anemia::bigint from public.v_salud_agregado where categoria = 'nino'),
  1::bigint,
  'nutricionista S: la anemia se cuenta dentro de las personas con permiso vigente'
);

select is(
  (select con_consentimiento::bigint from public.v_salud_agregado where categoria = 'nino'),
  4::bigint,
  'nutricionista S: con_consentimiento cuenta las estadísticas, no el seguimiento'
);

select is(
  (select con_medida::bigint from public.v_salud_agregado where categoria = 'nino'),
  10::bigint,
  'nutricionista S: con_medida también queda acotada a las personas con permiso'
);

-- Revocar a P-XX02 corta el agregado al instante: vuelve a 9 y el grupo se suprime.
reset role;
insert into consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
values (
  'c0000000-0000-4000-8000-000000000021',
  'eeeeeeee-0000-4000-8000-0000000000e1',
  'P-XX02', 'seguimiento', false, 1, '2026-11-22T10:00:00Z', '2026-11-22T10:00:00Z', 'dev-s', 21
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is_empty(
  'select * from public.v_salud_agregado',
  'nutricionista S: una revocación deja 9 vigentes y el grupo se suprime (k>=10)'
);

-- ---------------------------------------------------------------------------
-- 4. Escritura del miembro: INSERT en su olla sí, en la ajena no.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

with fila as (
  insert into public.consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
  values (
    'c0000000-0000-4000-8000-000000000022',
    'eeeeeeee-0000-4000-8000-0000000000e1',
    'P-XX07', 'estadisticas', true, 2, '2026-11-23T09:00:00Z', null, 'dev-s', 40
  )
  returning id
)
select is(
  (select count(*) from fila),
  1::bigint,
  'cocinera S: registra una firma en su olla (1 fila)'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
    values ('c0000000-0000-4000-8000-000000000023', 'eeeeeeee-0000-4000-8000-0000000000e1',
            'P-XX08', 'seguimiento', true, 1, '2026-11-23T09:10:00Z', null, 'dev-t', 41)$$,
  '42501', null,
  'organizadora T: INSERT de consentimiento en la olla S lanza 42501 (RLS)'
);

-- La FK compuesta: una persona de otra olla no entra ni como postgres.
reset role;

select throws_ok(
  $$insert into public.consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
    values ('c0000000-0000-4000-8000-000000000024', 'eeeeeeee-0000-4000-8000-0000000000e2',
            'P-XX09', 'seguimiento', true, 1, '2026-11-23T09:20:00Z', null, 'dev-t', 42)$$,
  '23503', null,
  'la FK compuesta rechaza una persona de otra olla (23503)'
);

select throws_ok(
  $$insert into public.consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
    values ('c0000000-0000-4000-8000-000000000025', 'eeeeeeee-0000-4000-8000-0000000000e1',
            'P-XX10', 'otro', true, 1, '2026-11-23T09:30:00Z', null, 'dev-s', 43)$$,
  '23514', null,
  'el tipo solo admite seguimiento | estadisticas (23514)'
);

select throws_ok(
  $$insert into public.consentimiento (id, olla_id, persona_id, tipo, otorgado, version, firmado_en, revocado_en, device_id, lamport)
    values ('c0000000-0000-4000-8000-000000000026', 'eeeeeeee-0000-4000-8000-0000000000e1',
            'P-XX10', 'seguimiento', true, 1, '2026-11-23T09:40:00Z', '2026-11-23T09:40:00Z', 'dev-s', 44)$$,
  '23514', null,
  'otorgado con revocado_en no es una fila válida (23514)'
);

-- ---------------------------------------------------------------------------
-- 5. Append-only desde el cliente: UPDATE, DELETE y TRUNCATE lanzan 42501.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$update public.consentimiento set otorgado = false
    where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'organizadora S: UPDATE de consentimiento lanza 42501 (append-only)'
);

select throws_ok(
  $$delete from public.consentimiento where id = 'c0000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'organizadora S: DELETE de consentimiento lanza 42501 (append-only)'
);

select throws_ok(
  $$truncate public.consentimiento$$,
  '42501', null,
  'organizadora S: TRUNCATE de consentimiento lanza 42501 (append-only)'
);

-- ---------------------------------------------------------------------------
-- 6. `evento_sync` acepta la entidad nueva y sigue cerrado a una inventada.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

with fila as (
  insert into public.evento_sync (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, creado_en)
  values (
    'e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 50, 'dev-s',
    'eeeeeeee-0000-4000-8000-0000000000e1', 'consentimiento',
    '{"id":"c0000000-0000-4000-8000-000000000030","tipo":"seguimiento","otorgado":true}'::jsonb,
    '2026-11-23T10:00:00Z'
  )
  returning event_uuid
)
select is(
  (select count(*) from fila),
  1::bigint,
  'cocinera S: evento_sync admite la entidad consentimiento'
);

select throws_ok(
  $$insert into public.evento_sync (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, creado_en)
    values ('e0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002', 51, 'dev-s',
            'eeeeeeee-0000-4000-8000-0000000000e1', 'inventada', '{}'::jsonb, '2026-11-23T10:01:00Z')$$,
  '23514', null,
  'evento_sync sigue rechazando una entidad desconocida (23514)'
);

select * from finish();

rollback;
