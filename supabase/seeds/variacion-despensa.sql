-- variacion-despensa.sql — #105: variación de despensa creíble en las 8 ollas.
--
-- Se aplica DESPUÉS de demo-grande.sql (config.toml [db.seed] sql_paths) y
-- depende de sus filas: ollas ...0001..0008 e insumos (arroz, lentejas, papa,
-- aceite, huevo, quinua). Idempotente: los ids salen del contenido con md5
-- (mismo patrón que demo-grande.sql) y todo lleva `on conflict (id) do nothing`.
-- Fechas fijas (2026-11-01..07): nunca now().
--
-- La variación es una tabla de 6 insumos × 8 ollas. Por cada celda (olla×insumo):
--   * entrada  2026-11-01 08:00  (+30 .. +58, hay que cubrir salidas + merma)
--   * salidas  2026-11-02..07 13:00 (deltas −1..−8, patrón fijo por día)
--   * cerrada con saldo POSITIVO en todos los casos, salvo el arroz de la
--     olla 1 (+28) y de la olla 2 (−8), que son los saldos que fija el issue.
-- A eso se suman:
--   * mermas 1-2 por olla en un insumo distinto (11-04 y/o 11-06)
--   * 3 transferencias entre ollas de lima-sur (pares −N/+N: la suma no cambia)
--
-- Saldos objetivo que fija tests/014_variacion.sql:
--   olla 1 / arroz: +40 de entrada y salidas 2+2+2+2+2+2 = 12  → saldo +28
--   olla 2 / arroz: +20 de entrada y salidas 5+5+5+5+4+4 = 28  → saldo  −8
--   El resto de combinaciones olla/insumo cierra en > 0.
--   Las transferencias restan en la olla de origen y suman en la de destino:
--   el saldo de cada olla cambia; la suma del par se conserva.
--
-- device_id por olla: `device_demo_0X` (X = 1..8). `lamport` se renumera al
-- final, por device y solo sobre las filas de este seed (autor = 'seed_demo' y
-- lamport = 0); la segunda corrida ya no encuentra filas que rellenar.

do $$
declare
  ollas uuid[] := array[
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000006',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008'
  ];
  insumos text[] := array['arroz', 'lentejas', 'papa', 'aceite', 'huevo', 'quinua'];
  -- Salidas por día (11-02..11-07) del insumo; el MISMO patrón 3,4,5,6,7,8
  -- (suma 33) para los 6 insumos, salvo arroz en las ollas 1 y 2 (abajo).
  salidas int[] := array[3, 4, 5, 6, 7, 8];
  -- Entrada por insumo: 33 (salidas) + hasta 8 (las dos mermas grandes de su
  -- insumo) + holgura → 60. Cabe el saldo > 0 en las 8 ollas.
  entradas int[] := array[60, 60, 60, 60, 60, 60];
  -- Excepción del issue: olla 1/arroz termina +28, olla 2/arroz termina −8.
  -- (Entradas y salidas de esas dos celdas sustituyen al 60/3..8.)
  arroz_olla1_entrada int := 40;
  arroz_olla1_salida  int := 2;
  arroz_olla2_entrada int := 20;
  arroz_olla2_salidas int[] := array[5, 5, 5, 5, 4, 4];

  -- Mermas por olla (índice 1..8). Una el 11-04; una segunda el 11-06 si
  -- merma2 > 0. Insumos rotados; nunca arroz en las ollas 1 y 2.
  merma_insumo  text[] := array['papa', 'lentejas', 'quinua', 'huevo', 'aceite', 'papa', 'lentejas', 'quinua'];
  merma1        int[]  := array[2, 3, 2, 4, 1, 2, 3, 2];
  merma2        int[]  := array[1, 0, 3, 0, 2, 1, 0, 3];
  merma2_insumo text[] := array['huevo', '', 'aceite', '', 'quinua', 'aceite', '', 'huevo'];

  -- Transferencias entre ollas de lima-sur (1,4,7,8): par (−N, +N) por insumo.
  trans_de     uuid[] := array[
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000007'
  ];
  trans_a      uuid[] := array[
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008'
  ];
  trans_insumo text[] := array['papa', 'aceite', 'quinua'];
  trans_cant   int[]  := array[5, 2, 3];
  trans_at     timestamptz[] := array[
    '2026-11-03T09:00:00Z',
    '2026-11-05T10:30:00Z',
    '2026-11-07T15:00:00Z'
  ];

  olla_idx int;
  insumo_idx int;
  dia int;
  delta int;
  dev text;
  clave text;
begin
  for olla_idx in 1..array_length(ollas, 1) loop
    dev := 'device_demo_0' || olla_idx;

    -- 1. entradas del 11-01 08:00
    for insumo_idx in 1..array_length(insumos, 1) loop
      clave := 'mov:' || ollas[olla_idx] || ':' || insumos[insumo_idx]
               || ':2026-11-01:entrada:ini';
      insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id)
      values (
        (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
         substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
         substr(md5(clave), 20, 12))::uuid,
        ollas[olla_idx], insumos[insumo_idx],
        case
          when insumos[insumo_idx] = 'arroz' and olla_idx = 1 then arroz_olla1_entrada
          when insumos[insumo_idx] = 'arroz' and olla_idx = 2 then arroz_olla2_entrada
          else entradas[insumo_idx]
        end,
        'entrada', 'seed_demo', '2026-11-01T08:00:00Z', dev
      )
      on conflict (id) do nothing;
    end loop;

    -- 2. salidas del 11-02 al 11-07, a las 13:00
    for insumo_idx in 1..array_length(insumos, 1) loop
      for dia in 2..7 loop
        if insumos[insumo_idx] = 'arroz' and olla_idx = 1 then
          delta := -arroz_olla1_salida;
        elsif insumos[insumo_idx] = 'arroz' and olla_idx = 2 then
          delta := -arroz_olla2_salidas[dia - 1];
        else
          delta := -salidas[insumo_idx];
        end if;
        clave := 'mov:' || ollas[olla_idx] || ':' || insumos[insumo_idx]
                 || ':2026-11-0' || dia || ':salida:d' || dia;
        insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id)
        values (
          (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
           substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
           substr(md5(clave), 20, 12))::uuid,
          ollas[olla_idx], insumos[insumo_idx], delta, 'salida',
          'seed_demo', ('2026-11-0' || dia || 'T13:00:00Z')::timestamptz, dev
        )
        on conflict (id) do nothing;
      end loop;
    end loop;

    -- 3. mermas: una el 11-04 y, si toca, otra el 11-06
    clave := 'mov:' || ollas[olla_idx] || ':' || merma_insumo[olla_idx]
             || ':2026-11-04:merma:m1';
    insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id)
    values (
      (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
       substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
       substr(md5(clave), 20, 12))::uuid,
      ollas[olla_idx], merma_insumo[olla_idx], -merma1[olla_idx], 'merma',
      'seed_demo', '2026-11-04T15:30:00Z', dev
    )
    on conflict (id) do nothing;

    if merma2[olla_idx] > 0 then
      clave := 'mov:' || ollas[olla_idx] || ':' || merma2_insumo[olla_idx]
               || ':2026-11-06:merma:m2';
      insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id)
      values (
        (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
         substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
         substr(md5(clave), 20, 12))::uuid,
        ollas[olla_idx], merma2_insumo[olla_idx], -merma2[olla_idx], 'merma',
        'seed_demo', '2026-11-06T16:00:00Z', dev
      )
      on conflict (id) do nothing;
    end if;
  end loop;

  -- 4. transferencias entre ollas de lima-sur: par (−N, +N) por insumo.
  --    La suma de las dos filas es 0: el saldo de la zona no cambia.
  for insumo_idx in 1..array_length(trans_insumo, 1) loop
    clave := 'mov:' || trans_de[insumo_idx] || ':' || trans_insumo[insumo_idx]
             || ':2026-11-04:transferencia:out' || insumo_idx;
    insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id)
    values (
      (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
       substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
       substr(md5(clave), 20, 12))::uuid,
      trans_de[insumo_idx], trans_insumo[insumo_idx], -trans_cant[insumo_idx],
      'transferencia', 'seed_demo', trans_at[insumo_idx],
      'device_demo_0' || array_position(ollas, trans_de[insumo_idx])
    )
    on conflict (id) do nothing;

    clave := 'mov:' || trans_a[insumo_idx] || ':' || trans_insumo[insumo_idx]
             || ':2026-11-04:transferencia:in' || insumo_idx;
    insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id)
    values (
      (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
       substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
       substr(md5(clave), 20, 12))::uuid,
      trans_a[insumo_idx], trans_insumo[insumo_idx], trans_cant[insumo_idx],
      'transferencia', 'seed_demo', trans_at[insumo_idx],
      'device_demo_0' || array_position(ollas, trans_a[insumo_idx])
    )
    on conflict (id) do nothing;
  end loop;

  -- 5. lamport por device: solo las filas de este seed que aún están en 0.
  --    `row_number()` sobre (at, id) da un orden estable; en la segunda corrida
  --    no queda ninguna fila con lamport = 0 de autor 'seed_demo'.
  with numerado as (
    select m.id, row_number() over (partition by m.device_id order by m.at, m.id) as n
    from public.movimientos m
    where m.autor = 'seed_demo' and m.lamport = 0
  )
  update public.movimientos m
     set lamport = numerado.n
    from numerado
   where m.id = numerado.id;
end $$;
