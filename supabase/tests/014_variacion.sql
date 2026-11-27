-- 014_variacion.sql — #105: variación de despensa (seed variacion-despensa.sql).
--
-- Se corre con `pnpm db:test` DESPUÉS de `db reset`: el seed ya dejó las filas.
-- Autocontenido: busca los movimientos por autor='seed_demo'; no crea fixtures
-- salvo la olla/member/device de la cocinera para la prueba de RLS.
--
-- Criterios del issue:
--   1. El saldo por fecha de olla 1/arroz cambia y termina > 0 (+28).
--   2. Olla 2/arroz termina < 0 (−8).
--   3. Hay entradas y hay salidas.
--   4. Una transferencia (−N, +N) conserva la suma entre las dos ollas.
--   5. RLS: la cocinera de la olla 1 no ve movimientos de la olla 2.
--
-- Rojo→verde: borrar las salidas del seed deja (1) sin cambio de saldo y (5)
-- intacto; quitar `movimientos_select` deja (5) en rojo. Los dos se revierten
-- en supabase/seeds/variacion-despensa.sql / migracion 20261123150000.

begin;

set search_path to extensions, pg_temp, public;

select plan(19);

-- Ids de olla fijos (demo-grande.sql).
--   1: ...0001 (Villa El Salvador)
--   2: ...0002 (San Juan de Lurigancho)

-- ---------------------------------------------------------------------------
-- 0. El seed aplicó: hay movimientos de variación (autor 'seed_demo').
-- ---------------------------------------------------------------------------
select cmp_ok(
  (select count(*) from public.movimientos where autor = 'seed_demo'),
  '>', 0::bigint,
  'el seed de variación dejó movimientos (autor seed_demo)'
);

-- ---------------------------------------------------------------------------
-- 1. Olla 1 / arroz: el saldo por fecha cambia y termina en +28.
-- ---------------------------------------------------------------------------
select is(
  (
    with por_fecha as (
      select m.at::date as fecha, sum(m.delta) as delta_dia
      from public.movimientos m
      where m.olla_id = '00000000-0000-4000-8000-000000000001'
        and m.insumo_id = 'arroz'
        and m.autor = 'seed_demo'
      group by m.at::date
    ),
    acumulado as (
      select fecha, dp, sum(dp) over (order by fecha) as saldo
      from (
        select fecha, delta_dia as dp from por_fecha
      ) f
    )
    select count(distinct saldo) from acumulado
  ),
  7::bigint,
  'olla 1/arroz: el saldo cambia de un día a otro (7 saldos distintos en 7 fechas)'
);

select is(
  (
    select coalesce(sum(m.delta), 0)
    from public.movimientos m
    where m.olla_id = '00000000-0000-4000-8000-000000000001'
      and m.insumo_id = 'arroz'
      and m.autor = 'seed_demo'
  ),
  28::numeric,
  'olla 1/arroz: saldo final +28 (40 de entrada − 12 de salidas)'
);

-- Primera fecha (11-01): solo la entrada, saldo +40.
select is(
  (
    select sum(m.delta)
    from public.movimientos m
    where m.olla_id = '00000000-0000-4000-8000-000000000001'
      and m.insumo_id = 'arroz'
      and m.autor = 'seed_demo'
      and m.at::date <= '2026-11-01'
  ),
  40::numeric,
  'olla 1/arroz: al 11-01 el saldo es +40 (solo la entrada)'
);

-- Última fecha (11-07): el saldo es el final, y es menor que el del 11-01.
select is(
  (
    select sum(m.delta)
    from public.movimientos m
    where m.olla_id = '00000000-0000-4000-8000-000000000001'
      and m.insumo_id = 'arroz'
      and m.autor = 'seed_demo'
      and m.at::date <= '2026-11-07'
  ),
  28::numeric,
  'olla 1/arroz: al 11-07 el saldo es +28, menor que al 11-01 (bajó por las salidas)'
);

-- ---------------------------------------------------------------------------
-- 2. Olla 2 / arroz: termina en −8.
-- ---------------------------------------------------------------------------
select is(
  (
    select coalesce(sum(m.delta), 0)
    from public.movimientos m
    where m.olla_id = '00000000-0000-4000-8000-000000000002'
      and m.insumo_id = 'arroz'
      and m.autor = 'seed_demo'
  ),
  -8::numeric,
  'olla 2/arroz: saldo final −8 (20 de entrada − 28 de salidas)'
);

select cmp_ok(
  (
    select sum(m.delta)
    from public.movimientos m
    where m.olla_id = '00000000-0000-4000-8000-000000000002'
      and m.insumo_id = 'arroz'
      and m.autor = 'seed_demo'
      and m.at::date <= '2026-11-07'
  ),
  '<', 0::numeric,
  'olla 2/arroz: el saldo al 11-07 es negativo (déficit visible)'
);

-- ---------------------------------------------------------------------------
-- 3. Hay entradas y salidas (y el resto de motivos del seed).
-- ---------------------------------------------------------------------------
select cmp_ok(
  (select count(*) from public.movimientos where autor = 'seed_demo' and motivo = 'entrada'),
  '>=', 48::bigint,
  'hay entradas: 6 insumos x 8 ollas = 48'
);

select cmp_ok(
  (select count(*) from public.movimientos where autor = 'seed_demo' and motivo = 'salida'),
  '>=', 288::bigint,
  'hay salidas: 6 insumos x 6 días x 8 ollas = 288'
);

select cmp_ok(
  (select count(*) from public.movimientos where autor = 'seed_demo' and motivo = 'merma'),
  '>=', 8::bigint,
  'hay mermas: al menos 1 por olla'
);

select cmp_ok(
  (select count(*) from public.movimientos where autor = 'seed_demo' and motivo = 'transferencia'),
  '>=', 6::bigint,
  'hay transferencias: 3 pares (−N/+N) = 6 filas'
);

-- Ninguna fila con delta 0 (el check lo impide; se afirma igual).
select is(
  (select count(*) from public.movimientos where autor = 'seed_demo' and delta = 0),
  0::bigint,
  'ningún movimiento del seed tiene delta 0'
);

-- lamport > 0 en todas las filas del seed (el UPDATE final lo rellenó).
select is(
  (select count(*) from public.movimientos where autor = 'seed_demo' and lamport = 0),
  0::bigint,
  'lamport rellenado en todas las filas del seed (ninguna en 0)'
);

-- lamport único por device dentro del seed (sin colisiones).
select is(
  (
    select count(*)
    from (
      select device_id, lamport
      from public.movimientos
      where autor = 'seed_demo'
      group by device_id, lamport
      having count(*) > 1
    ) dup
  ),
  0::bigint,
  'lamport no colisiona dentro de cada device'
);

-- ---------------------------------------------------------------------------
-- 4. Transferencia: la suma entre las dos ollas se conserva.
--    Olla 4/aceite y olla 7/aceite (11-05, −2/+2). Antes y después de la
--    transferencia, la suma de los movimientos de variación en las dos ollas
--    para aceite debe ser la misma.
-- ---------------------------------------------------------------------------
select is(
  (
    select sum(m.delta)
    from public.movimientos m
    where m.autor = 'seed_demo'
      and m.insumo_id = 'aceite'
      and m.olla_id in (
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000007'
      )
      and m.motivo = 'transferencia'
  ),
  0::numeric,
  'transferencia aceite olla4→olla7: la suma de las dos filas es 0'
);

select is(
  (
    select coalesce(sum(m.delta), 0)
    from public.movimientos m
    where m.autor = 'seed_demo'
      and m.insumo_id = 'aceite'
      and m.olla_id in (
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000007'
      )
      and m.motivo = 'transferencia'
      and m.at < '2026-11-05T10:30:00Z'
  ),
  0::numeric,
  'antes de la transferencia la suma aportada por transferencias es 0'
);

-- ---------------------------------------------------------------------------
-- 5. RLS: la cocinera de la olla 1 no ve movimientos de la olla 2.
--    Se crea una cocinera en la olla 1 (member 101 ya es organizadora, así que
--    el device va a un member nuevo) y otro device para la olla 2.
-- ---------------------------------------------------------------------------
insert into public.members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-000001400001', 'hash-cocinera-t105', 'rec-cocinera-t105'),
  ('bbbbbbbb-0000-4000-8000-000001400002', 'hash-cocinera-t105b', 'rec-cocinera-t105b');

insert into public.devices (user_id, member_id)
values
  ('55000000-0000-4000-8000-000001400001', 'bbbbbbbb-0000-4000-8000-000001400001'),
  ('55000000-0000-4000-8000-000001400002', 'bbbbbbbb-0000-4000-8000-000001400002');

insert into public.olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-000001400001', '00000000-0000-4000-8000-000000000001', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-000001400002', '00000000-0000-4000-8000-000000000002', 'cocinera');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"55000000-0000-4000-8000-000001400001","role":"authenticated"}',
  true
);

select cmp_ok(
  (select count(*) from public.movimientos where autor = 'seed_demo'
     and olla_id = '00000000-0000-4000-8000-000000000001'),
  '>', 0::bigint,
  'cocinera de la olla 1: ve los movimientos de SU olla'
);

select is(
  (select count(*) from public.movimientos where autor = 'seed_demo'
     and olla_id = '00000000-0000-4000-8000-000000000002'),
  0::bigint,
  'cocinera de la olla 1: NO ve movimientos de la olla 2 (RLS)'
);

select is(
  (
    select count(*)
    from public.movimientos m
    where m.olla_id not in (select app.mis_ollas())
  ),
  0::bigint,
  'cocinera de la olla 1: ninguna fila ajena a mis_ollas() es visible'
);

select * from finish();

rollback;
