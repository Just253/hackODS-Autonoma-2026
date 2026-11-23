-- 006_enrolamiento.sql — #62: `app.enroll()` y `members.pin_hash` no legible.
--
-- Criterios del issue:
--   1. Un JWT SIN device ve 0 filas en `app.mis_ollas()` y en las tablas de la olla.
--   2. Tras `app.enroll()` con el PIN correcto, el MISMO JWT ve 1 olla.
--   3. PIN incorrecto: `app.enroll()` rechaza (28P01) y no crea device.
--   4. `authenticated` no tiene SELECT de `members.pin_hash` ni `recovery_hash`.
--   5. `devices.revoked_at` seteado: `app.mis_ollas()` deja de devolver esa olla.
--   6. `app.enroll()` no es invocable por anon/authenticated.
--
-- Autocontenido como 002/003: crea sus ollas, members (bcrypt real de '1234') y una
-- persona. `app.enroll()` NO se llama como `authenticated`: sin EXECUTE, la invoca el
-- `postgres` de la transacción con el `sub` del JWT en `request.jwt.claims`, que es lo
-- que hace la Edge Function con service_role.
--
-- Semántica medida de este runner (`supabase test db` + pg_prove):
--   * Cada `is`/`ok`/`throws_ok` es una tarea aparte: el `set local` de una aserción no
--     llega a la siguiente.
--   * `throws_ok` corre el bloque en una SUBtransacción: lo que escribe se revierte.
--   * Un `do $$ … $$` es una sola sentencia: su `set_config` sí llega a la aserción
--     siguiente, y lo que escribe queda en la transacción del runner.
-- Por eso el enrolamiento real va en un `do`, y el rol para leer se cambia con
-- `set_config('role', …)` (mismo efecto que `set local role`, sin depender de la tarea).
--
-- Rojo→verde: sacando 20261123192000_enrolamiento.sql fallan 3-8 (grants y función),
-- 9-11 (`pin_hash` legible) y 14-21 (`app.enroll` no existe). 22-23 (revoked_at) siguen
-- verdes: los cubre el helper base de 20261123150000.

begin;

select plan(23);

-- ---------------------------------------------------------------------------
-- Fixtures. La transacción es de `postgres` hasta el primer cambio de rol.
-- ---------------------------------------------------------------------------
insert into public.ollas (id, titulo, codigo, tipo, distrito)
values
  ('cccccccc-0000-4000-8000-000000000001', 'olla enrol (test 006)', 'ZZZZE2', 'comun', 'test'),
  ('cccccccc-0000-4000-8000-000000000002', 'olla enrol ajena (test 006)', 'ZZZZE3', 'comun', 'test');

insert into public.members (id, pin_hash, recovery_hash)
values
  ('dddddddd-0000-4000-8000-000000000001',
   crypt('1234', gen_salt('bf', 8)), crypt('rec-enrol-01', gen_salt('bf', 8))),
  ('dddddddd-0000-4000-8000-000000000002',
   crypt('9999', gen_salt('bf', 8)), crypt('rec-ajena', gen_salt('bf', 8)));

insert into public.olla_members (member_id, olla_id, rol)
values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'organizadora'),
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002', 'cocinera');

insert into public.personas (codigo_p, olla_id, anio_nacimiento, sexo, categoria, device_id)
values
  ('P-EE01', 'cccccccc-0000-4000-8000-000000000001', 1990, 'F', 'adulto', 'dev-test-006');

-- ---------------------------------------------------------------------------
-- 1. Hash bcrypt real: crypt() valida el PIN demo del seed y el del fixture.
-- ---------------------------------------------------------------------------
select ok(
  (select crypt('1234', pin_hash) = pin_hash from public.members
   where id = '00000000-0000-4000-8000-000000000101'),
  'seed: crypt(''1234'', pin_hash) valida el hash de members 101'
);

select ok(
  (select crypt('1234', pin_hash) = pin_hash from public.members
   where id = 'dddddddd-0000-4000-8000-000000000001')
  and not (select crypt('9999', pin_hash) = pin_hash from public.members
           where id = 'dddddddd-0000-4000-8000-000000000001'),
  'fixture: el hash de 1234 valida 1234 y rechaza 9999'
);

-- ---------------------------------------------------------------------------
-- 2. Privilegios de columna y de función (estables con y sin LOGIN).
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.members', 'pin_hash', 'select'),
  'authenticated no tiene SELECT de members.pin_hash'
);

select ok(
  not has_column_privilege('authenticated', 'public.members', 'recovery_hash', 'select'),
  'authenticated no tiene SELECT de members.recovery_hash'
);

select ok(
  not has_column_privilege('anon', 'public.members', 'pin_hash', 'select'),
  'anon no tiene SELECT de members.pin_hash'
);

select ok(
  not has_column_privilege('authenticated', 'public.members', 'id', 'select'),
  'authenticated no tiene SELECT de members.id (member_id se lee por devices)'
);

-- `to_regprocedure` y no el literal: sin la migración la función no existe y
-- `has_function_privilege(text)` aborta el archivo en vez de fallar una aserción.
select ok(
  to_regprocedure('app.enroll(uuid, text, text, text)') is not null
  and not has_function_privilege('authenticated', 'app.enroll(uuid, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'app.enroll(uuid, text, text, text)', 'execute'),
  'app.enroll solo la invoca el servidor (sin EXECUTE para anon/authenticated)'
);

select ok(
  has_function_privilege('authenticated', 'app.mis_ollas()', 'execute')
  and not has_function_privilege('anon', 'app.mis_ollas()', 'execute'),
  'app.mis_ollas: authenticated sí, anon no'
);

-- ---------------------------------------------------------------------------
-- 3. JWT sin device: 0 filas. Es el bug medido del issue.
--    `app.mis_ollas()` lee `auth.uid()`: con el `sub` en el GUC basta.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated"}', true);
end;
$$;

select is(
  (select count(*) from app.mis_ollas()),
  0::bigint,
  'JWT sin device: app.mis_ollas() devuelve 0 ollas'
);

-- Rol por request, como cada `createClient(anon)` con JWT.
select set_config('role', 'authenticated', true),
       set_config('search_path', 'extensions, public', true) is not null;

select is(
  (select count(*) from ollas where id = 'cccccccc-0000-4000-8000-000000000001'),
  0::bigint,
  'JWT sin device: 0 filas en ollas'
);

select is(
  (select count(*) from personas where codigo_p = 'P-EE01'),
  0::bigint,
  'JWT sin device: 0 filas en personas'
);

-- El hash ya no es legible por el propio miembro (bug del issue).
select throws_ok(
  'select pin_hash from public.members',
  '42501', null,
  'JWT del miembro: select pin_hash lanza 42501'
);

select throws_ok(
  'select recovery_hash from public.members',
  '42501', null,
  'JWT del miembro: select recovery_hash lanza 42501'
);

-- `app.enroll` sin EXECUTE para authenticated: el cliente no puede llamarla.
select throws_ok(
  $$select app.enroll('eeeeeeee-0000-4000-8000-000000000001', 'ZZZZE2', '1234', 'dev-evil')$$,
  '42501', null,
  'authenticated: app.enroll lanza 42501 (sin EXECUTE)'
);

-- ---------------------------------------------------------------------------
-- 4. PIN incorrecto: rechaza y no crea device. Se invoca como `postgres`
--    (service_role en la Edge Function) con el `sub` del JWT en el GUC.
--    La sesión quedó en `authenticated`, así que `reset role` va en el MISMO bloque.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$reset role; select app.enroll(
       'eeeeeeee-0000-4000-8000-000000000001', 'ZZZZE2', '0000', 'dev-x')$$,
  '28P01', null,
  'PIN incorrecto: app.enroll lanza 28P01'
);

select is(
  (select count(*) from public.devices
   where user_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  0::bigint,
  'PIN incorrecto: no se creó la fila de devices'
);

-- Codigo inexistente: rechaza (22023) y no enrola nada.
select throws_ok(
  $$reset role; select app.enroll(
       'eeeeeeee-0000-4000-8000-000000000001', 'ZZZZZ9', '1234', 'dev-x')$$,
  '22023', null,
  'codigo de olla inexistente: app.enroll lanza 22023'
);

-- ---------------------------------------------------------------------------
-- 5. Enrolamiento correcto y lectura con el MISMO JWT.
--    En un `do`, que es una sentencia de la transacción del runner: ni
--    subtransacción (`throws_ok` revierte lo escrito) ni `set local` perdido.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('role', 'postgres', true),
          set_config('search_path', 'extensions, pg_temp, public', true);
  perform * from app.enroll('eeeeeeee-0000-4000-8000-000000000001'::uuid,
                             'ZZZZE2'::text, '1234'::text, 'dev-enrol-006'::text);
end;
$$;

select is(
  (select count(*) from public.devices
   where user_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  1::bigint,
  'enroll correcto: crea una fila en devices'
);

select is(
  (select om.rol from public.olla_members om
     join public.devices d on d.member_id = om.member_id
   where d.user_id = 'eeeeeeee-0000-4000-8000-000000000001'
     and om.olla_id = 'cccccccc-0000-4000-8000-000000000001'),
  'organizadora',
  'enroll correcto: devices y olla_members apuntan al miembro del PIN'
);

-- Rol por request (`createClient(anon)` + JWT). El `do` deja el SET LOCAL en la
-- transacción del runner, así el `select` siguiente ya lo ve.
do $$
begin
  perform set_config('role', 'authenticated', true),
          set_config('search_path', 'extensions, public', true);
end;
$$;

select is(
  (select count(*) from ollas where id = 'cccccccc-0000-4000-8000-000000000001'),
  1::bigint,
  'enroll: el MISMO JWT ya ve la olla (1 fila)'
);

select is(
  (select count(*) from personas where codigo_p = 'P-EE01'),
  1::bigint,
  'enroll: el MISMO JWT ya ve la persona de la olla'
);

-- ---------------------------------------------------------------------------
-- 6. Revocación: siguiente request, la olla desaparece.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('role', 'postgres', true),
          set_config('search_path', 'extensions, pg_temp, public', true);
  update public.devices set revoked_at = '2026-11-23T12:00:00Z'
  where user_id = 'eeeeeeee-0000-4000-8000-000000000001';
end;
$$;

select is(
  (select count(*) from app.mis_ollas()),
  0::bigint,
  'device revocado: app.mis_ollas() devuelve 0 ollas'
);

do $$
begin
  perform set_config('role', 'authenticated', true),
          set_config('search_path', 'extensions, public', true);
end;
$$;

select is(
  (select count(*) from ollas where id = 'cccccccc-0000-4000-8000-000000000001'),
  0::bigint,
  'device revocado: 0 filas en ollas'
);

select * from finish();

rollback;
