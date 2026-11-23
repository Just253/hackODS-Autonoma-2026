-- demo-grande.sql — SEMILLA AMPLIADA, SOLO PARA LA DEMO. DATOS FICTICIOS (D7).
--
-- Se aplica DESPUES de `supabase/seed.sql` (orden en supabase/config.toml
-- [db.seed] sql_paths) y depende de sus filas: ollas ...0001..0003, insumos de
-- la olla 1/2/3, plantillas 301/302. Idempotente: `on conflict do nothing` y
-- fechas fijas 2026-11-01..07, nunca `now()`.
--
-- Privacidad (docs/DECISIONES.md D2/D7):
--   * Personas solo por codigo P-XXXX; ninguna identidad, documento ni telefono.
--   * Los valores de salud (anemia/peso/talla) son inventados y marcados asi.
--   * Ojo con seed-paridad.test.ts: lee el PRIMER bloque `insert into precios
--     (...) values` de seed.sql. Este archivo es otro fichero y su serie de
--     precios va en un `do $$ ... loop`, nunca en un insert con VALUES inline.

-- ---------------------------------------------------------------------------
-- Ollas 4..8 (codigos sin 0/O/1/I)
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito) values
  ('00000000-0000-4000-8000-000000000004', 'Olla Demo Villa Maria del Triunfo', 'DEMHDD', 'comun', 'Villa Maria del Triunfo'),
  ('00000000-0000-4000-8000-000000000005', 'Olla Demo Ate', 'DEMHEE', 'comun', 'Ate'),
  ('00000000-0000-4000-8000-000000000006', 'Comedor Demo Independencia', 'DEMHFF', 'comedor_pca', 'Independencia'),
  ('00000000-0000-4000-8000-000000000007', 'Olla Demo Lurin', 'DEMHGG', 'comun', 'Lurin'),
  ('00000000-0000-4000-8000-000000000008', 'Comedor Demo Pachacamac', 'DEMHHH', 'comedor_pca', 'Pachacamac')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Members demo 103..108. PIN ficticio '1234' y recovery ficticio, marcados en el
-- texto para que nadie los confunda con credenciales utiles.
-- ---------------------------------------------------------------------------
insert into members (id, pin_hash, recovery_hash) values
  ('00000000-0000-4000-8000-000000000103', crypt('1234', gen_salt('bf', 8)), crypt('demo-recovery-103', gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-000000000104', crypt('1234', gen_salt('bf', 8)), crypt('demo-recovery-104', gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-000000000105', crypt('1234', gen_salt('bf', 8)), crypt('demo-recovery-105', gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-000000000106', crypt('1234', gen_salt('bf', 8)), crypt('demo-recovery-106', gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-000000000107', crypt('1234', gen_salt('bf', 8)), crypt('demo-recovery-107', gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-000000000108', crypt('1234', gen_salt('bf', 8)), crypt('demo-recovery-108', gen_salt('bf', 8)))
on conflict (id) do nothing;

insert into olla_members (member_id, olla_id, rol) values
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000004', 'cocinera'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000005', 'nutricionista'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000004', 'organizadora'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000005', 'organizadora'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000006', 'cocinera'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000007', 'admin'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000007', 'organizadora'),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000008', 'cocinera')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Personas P-0007..P-0042 (36), repartidas entre las 8 ollas. Casos borde:
-- anemia 'si' con peso/talla, consentimiento variado y 2 bajas logicas al final.
-- ---------------------------------------------------------------------------
insert into personas
  (codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia, peso_kg, talla_cm,
   consentimiento_seguimiento, notas, device_id)
values
  ('P-0007', '00000000-0000-4000-8000-000000000001', 2019, 'M', 'nino', 'no', 16.20, 102.00, true, 'Demo: escolar con seguimiento', 'device_demo_01'),
  ('P-0008', '00000000-0000-4000-8000-000000000001', 1990, 'F', 'gestante', 'si', 61.30, 155.00, true, 'Demo: gestante con anemia reportada', 'device_demo_01'),
  ('P-0009', '00000000-0000-4000-8000-000000000001', 1961, 'M', 'adulto_mayor', 'sin_dato', null, null, false, 'Demo: adulto mayor sin dato de salud', 'device_demo_01'),
  ('P-0010', '00000000-0000-4000-8000-000000000001', 1985, 'F', 'adulto', 'no', 57.10, 158.00, true, 'Demo: adulto con consentimiento', 'device_demo_01'),
  ('P-0011', '00000000-0000-4000-8000-000000000001', 2023, 'M', 'nino', 'sin_dato', null, null, false, 'Demo: menor de 5', 'device_demo_01'),
  ('P-0012', '00000000-0000-4000-8000-000000000002', 1994, 'M', 'adulto', 'sin_dato', null, null, false, null, 'device_demo_02'),
  ('P-0013', '00000000-0000-4000-8000-000000000002', 2024, 'F', 'lactante', 'no', 9.80, 78.00, true, 'Demo: lactante con control', 'device_demo_02'),
  ('P-0014', '00000000-0000-4000-8000-000000000002', 1958, 'F', 'adulto_mayor', 'si', 54.20, 149.00, true, 'Demo: adulto mayor con anemia reportada', 'device_demo_02'),
  ('P-0015', '00000000-0000-4000-8000-000000000002', 1998, 'F', 'gestante', 'no', 63.90, 160.00, true, 'Demo: gestante', 'device_demo_02'),
  ('P-0016', '00000000-0000-4000-8000-000000000003', 2016, 'M', 'nino', 'no', 38.40, 140.00, false, 'Demo: escolar', 'device_demo_03'),
  ('P-0017', '00000000-0000-4000-8000-000000000003', 1982, 'F', 'adulto', 'si', 59.70, 157.00, true, 'Demo: adulto con anemia reportada', 'device_demo_03'),
  ('P-0018', '00000000-0000-4000-8000-000000000003', 1945, 'M', 'adulto_mayor', 'sin_dato', null, null, false, 'Demo: adulto mayor', 'device_demo_03'),
  ('P-0019', '00000000-0000-4000-8000-000000000004', 2021, 'F', 'nino', 'no', 12.60, 88.00, true, 'Demo: menor de 5 con control', 'device_demo_04'),
  ('P-0020', '00000000-0000-4000-8000-000000000004', 1991, 'M', 'adulto', 'no', 70.20, 171.00, false, null, 'device_demo_04'),
  ('P-0021', '00000000-0000-4000-8000-000000000004', 1997, 'F', 'gestante', 'si', 60.10, 154.00, true, 'Demo: gestante con anemia reportada', 'device_demo_04'),
  ('P-0022', '00000000-0000-4000-8000-000000000004', 1952, 'F', 'adulto_mayor', 'no', 52.30, 147.00, true, 'Demo: adulto mayor con consentimiento', 'device_demo_04'),
  ('P-0023', '00000000-0000-4000-8000-000000000004', 2025, 'M', 'lactante', 'sin_dato', null, null, false, 'Demo: lactante sin dato', 'device_demo_04'),
  ('P-0024', '00000000-0000-4000-8000-000000000005', 2018, 'F', 'nino', 'no', 21.50, 115.00, true, 'Demo: escolar con seguimiento', 'device_demo_05'),
  ('P-0025', '00000000-0000-4000-8000-000000000005', 1987, 'M', 'adulto', 'sin_dato', null, null, false, null, 'device_demo_05'),
  ('P-0026', '00000000-0000-4000-8000-000000000005', 1967, 'F', 'adulto_mayor', 'si', 56.80, 150.00, true, 'Demo: adulto mayor con anemia reportada', 'device_demo_05'),
  ('P-0027', '00000000-0000-4000-8000-000000000005', 1996, 'F', 'lactante', 'no', 58.40, 156.00, true, 'Demo: lactante materna', 'device_demo_05'),
  ('P-0028', '00000000-0000-4000-8000-000000000005', 2013, 'M', 'nino', 'no', 31.70, 132.00, false, 'Demo: adolescente menor de edad', 'device_demo_05'),
  ('P-0029', '00000000-0000-4000-8000-000000000006', 1989, 'F', 'gestante', 'no', 64.60, 161.00, true, 'Demo: gestante', 'device_demo_06'),
  ('P-0030', '00000000-0000-4000-8000-000000000006', 2022, 'M', 'nino', 'si', 13.10, 91.00, true, 'Demo: menor de 5 con anemia reportada', 'device_demo_06'),
  ('P-0031', '00000000-0000-4000-8000-000000000006', 1975, 'M', 'adulto', 'sin_dato', null, null, false, null, 'device_demo_06'),
  ('P-0032', '00000000-0000-4000-8000-000000000006', 1948, 'F', 'adulto_mayor', 'no', 51.90, 146.00, false, 'Demo: adulto mayor', 'device_demo_06'),
  ('P-0033', '00000000-0000-4000-8000-000000000007', 2020, 'F', 'nino', 'sin_dato', null, null, false, 'Demo: menor de 5 sin dato', 'device_demo_07'),
  ('P-0034', '00000000-0000-4000-8000-000000000007', 1984, 'M', 'adulto', 'no', 68.40, 168.00, true, 'Demo: adulto con consentimiento', 'device_demo_07'),
  ('P-0035', '00000000-0000-4000-8000-000000000007', 1993, 'F', 'gestante', 'si', 62.50, 158.00, true, 'Demo: gestante con anemia reportada', 'device_demo_07'),
  ('P-0036', '00000000-0000-4000-8000-000000000007', 1955, 'M', 'adulto_mayor', 'no', 66.10, 163.00, false, null, 'device_demo_07'),
  ('P-0037', '00000000-0000-4000-8000-000000000008', 2023, 'F', 'lactante', 'no', 10.20, 80.00, true, 'Demo: lactante con control', 'device_demo_08'),
  ('P-0038', '00000000-0000-4000-8000-000000000008', 2000, 'M', 'adulto', 'sin_dato', null, null, false, null, 'device_demo_08'),
  ('P-0039', '00000000-0000-4000-8000-000000000008', 2017, 'F', 'nino', 'no', 26.80, 124.00, true, 'Demo: escolar', 'device_demo_08'),
  ('P-0040', '00000000-0000-4000-8000-000000000008', 1963, 'F', 'adulto_mayor', 'si', 58.70, 151.00, true, 'Demo: adulto mayor con anemia reportada', 'device_demo_08'),
  ('P-0041', '00000000-0000-4000-8000-000000000008', 1986, 'M', 'adulto', 'no', 72.30, 170.00, true, 'Demo: adulto con consentimiento', 'device_demo_08'),
  ('P-0042', '00000000-0000-4000-8000-000000000008', 2024, 'F', 'nino', 'sin_dato', null, null, false, 'Demo: baja logica (ver update abajo)', 'device_demo_08')
on conflict (codigo_p) do nothing;

update personas set deleted_at = '2026-11-06T09:00:00Z'
where codigo_p = 'P-0042' and deleted_at is null;

update personas set deleted_at = '2026-11-07T09:00:00Z'
where codigo_p = 'P-0032' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Insumos nuevos, todos en la olla 1 (comparten catálogo con arroz/papa).
-- ---------------------------------------------------------------------------
insert into insumos
  (id, olla_id, denominacion, grupo, unidad_base, gramos_por_unidad, stock_minimo, perecedero, alergenos, device_id)
values
  ('pollo', '00000000-0000-4000-8000-000000000001', 'Pollo demo', 'carne', 'g', null, 5000, true, '{}', 'device_demo_01'),
  ('atun', '00000000-0000-4000-8000-000000000001', 'Atun demo', 'carne', 'g', null, 2000, true, '{pescado}', 'device_demo_01'),
  ('frijol', '00000000-0000-4000-8000-000000000001', 'Frijol demo', 'menestra', 'g', null, 3000, false, '{}', 'device_demo_01'),
  ('arveja', '00000000-0000-4000-8000-000000000001', 'Arveja demo', 'menestra', 'g', null, 2000, false, '{}', 'device_demo_01'),
  ('tomate', '00000000-0000-4000-8000-000000000001', 'Tomate demo', 'verdura', 'g', null, 1500, true, '{}', 'device_demo_01'),
  ('cebolla', '00000000-0000-4000-8000-000000000001', 'Cebolla demo', 'verdura', 'g', null, 1500, true, '{}', 'device_demo_01'),
  ('avena', '00000000-0000-4000-8000-000000000001', 'Avena demo', 'cereal', 'g', null, 2000, false, '{gluten}', 'device_demo_01'),
  ('azucar', '00000000-0000-4000-8000-000000000001', 'Azucar demo', 'endulzante', 'g', null, 1000, false, '{}', 'device_demo_01')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Serie de precios: 6 productos x 2 canales x 7 dias = 84 observaciones, en olla 1.
-- Precio base en microcentesimos por unidad base (ADR-0004); variacion fija por
-- dia (dias 1..7 x 1000), sin now(). Ninguna fila cae en el bloque `values` de
-- seed.sql, asi que seed-paridad.test.ts sigue leyendo su primer insert intacto.
-- El id sale del contenido (md5) y no de gen_random_uuid(): con uuid aleatorio el
-- `on conflict (id)` no frena nada y la segunda corrida duplica la serie.
-- ---------------------------------------------------------------------------
do $$
declare
  prod text[] := array['arroz', 'lentejas', 'papa', 'pollo', 'huevo', 'quinua'];
  base bigint[] := array[420000, 780000, 230000, 1100000, 50000, 940000];
  canal text;
  dia int;
  i int;
  clave text;
begin
  for i in 1..array_length(prod, 1) loop
    foreach canal in array array['mayorista', 'minorista'] loop
      for dia in 1..7 loop
        clave := prod[i] || '|' || canal || '|2026-11-0' || dia;
        insert into precios (id, olla_id, insumo_id, canal, unidad, precio, fecha, fuente, url)
        values (
          (substr(md5(clave), 1, 8) || '-' || substr(md5(clave), 9, 4) || '-4' ||
           substr(md5(clave), 13, 3) || '-' || substr(md5(clave), 16, 4) || '-' ||
           substr(md5(clave), 20, 12))::uuid,
          '00000000-0000-4000-8000-000000000001',
          prod[i],
          canal,
          case when prod[i] = 'huevo' then 'unidad' else 'g' end,
          base[i] + (dia * 1000) + (case when canal = 'minorista' then 60000 else 0 end),
          ('2026-11-0' || dia)::date,
          'demo-ficticio',
          null
        )
        on conflict (id) do nothing;
      end loop;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Menus nuevos: plantillas 303 (general/B) y 304 (especial/B), en la olla 2.
-- Hashes REALES ya calculados con sha256Hex(serializarContenido(...)):
--   303 -> sha256("menu:...0303|perfil:general|opcion:B|...0511|almuerzo|Arroz con pollo demo|adulto:300:g,gestante:340:g,menor_5:200:g")
--   304 -> sha256("menu:...0304|perfil:especial|opcion:B|...0512|cena|Sopa de quinua demo|adulto:280:g,menor_5:180:g")
-- ---------------------------------------------------------------------------
insert into menu_template
  (id, olla_id, perfil, opcion, estado, sello_nutricionista, sello_cnp, sello_fecha, version, hash)
values
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000002',
   'general', 'B', 'publicado', 'Nutricionista Demo', 'CNP-DEMO-0001', '2026-11-02T10:00:00Z', 1,
   'c11fd13357956165ebbfa8a9b8a70af4fdd5638d7e41437e794b5e1b6bff22a2'),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000002',
   'especial', 'B', 'aprobado', 'Nutricionista Demo', 'CNP-DEMO-0001', '2026-11-02T10:00:00Z', 1,
   'e39c232eb1901dadee5e3a571280d8ee1139a5647bb6bf8aec8f5bc9cb2d6df7')
on conflict (id) do nothing;

insert into menu_day (id, olla_id, template_id, dia_semana, fecha, version, hash) values
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000303', 1, '2026-11-23', 1,
   encode(digest('menu-demo-general-B-dia-1', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000304', 1, '2026-11-23', 1,
   encode(digest('menu-demo-especial-B-dia-1', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into dish (id, olla_id, menu_day_id, momento, titulo, version, hash) values
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000402', 'almuerzo', 'Arroz con pollo demo', 1,
   encode(digest('dish-demo-arroz-con-pollo', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000403', 'cena', 'Sopa de quinua demo', 1,
   encode(digest('dish-demo-sopa-quinua', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into ingredient (id, olla_id, dish_id, insumo_id, gramos, unidad, version, hash) values
  ('00000000-0000-4000-8000-000000000611', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000511', 'pollo', 90, 'g', 1,
   encode(digest('ing-demo-pollo-90', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000612', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000511', 'arroz', 80, 'g', 1,
   encode(digest('ing-demo-arroz-80', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000613', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000512', 'quinua', 70, 'g', 1,
   encode(digest('ing-demo-quinua-70', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into portion (id, olla_id, dish_id, grupo, cantidad, unidad, version, hash) values
  ('00000000-0000-4000-8000-000000000711', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000511', 'adulto', 300, 'g', 1,
   encode(digest('portion-demo-303-adulto', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000712', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000511', 'gestante', 340, 'g', 1,
   encode(digest('portion-demo-303-gestante', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000713', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000511', 'menor_5', 200, 'g', 1,
   encode(digest('portion-demo-303-menor-5', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000714', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000512', 'adulto', 280, 'g', 1,
   encode(digest('portion-demo-304-adulto', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000715', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000512', 'menor_5', 180, 'g', 1,
   encode(digest('portion-demo-304-menor-5', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into validation (id, olla_id, template_id, estado, hallazgos, validador, cnp, fecha, version, hash) values
  ('00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000303', 'aprobado', '{}', 'Nutricionista Demo', 'CNP-DEMO-0001',
   '2026-11-02T10:00:00Z', 1, encode(digest('validation-demo-general-B', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000304', 'aprobado', '{}', 'Nutricionista Demo', 'CNP-DEMO-0001',
   '2026-11-02T10:00:00Z', 1, encode(digest('validation-demo-especial-B', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into menu_constraint (id, olla_id, template_id, tipo, valor, motivo, version, hash) values
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000304', 'dieta', 'bajo_sodio', 'Restriccion demo', 1,
   encode(digest('constraint-demo-bajo-sodio', 'sha256'), 'hex'))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Movimientos demo 1111..1130: entrada/salida/merma/ajuste/transferencia en
-- 6 ollas, todos con `at` fijo y delta <> 0.
-- ---------------------------------------------------------------------------
insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id) values
  ('00000000-0000-4000-8000-000000001111', '00000000-0000-4000-8000-000000000001', 'pollo', 12000, 'entrada', 'member_demo_01', '2026-11-01T08:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001112', '00000000-0000-4000-8000-000000000001', 'pollo', -3500, 'salida', 'member_demo_01', '2026-11-01T12:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001113', '00000000-0000-4000-8000-000000000001', 'tomate', -800, 'merma', 'member_demo_01', '2026-11-02T15:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001114', '00000000-0000-4000-8000-000000000001', 'frijol', 6000, 'entrada', 'member_demo_01', '2026-11-03T08:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001115', '00000000-0000-4000-8000-000000000002', 'arveja', 3000, 'entrada', 'member_demo_02', '2026-11-02T08:00:00Z', 'device_demo_02'),
  ('00000000-0000-4000-8000-000000001116', '00000000-0000-4000-8000-000000000002', 'arveja', -500, 'merma', 'member_demo_02', '2026-11-04T10:00:00Z', 'device_demo_02'),
  ('00000000-0000-4000-8000-000000001117', '00000000-0000-4000-8000-000000000002', 'aceite', 2500, 'entrada', 'member_demo_02', '2026-11-03T09:00:00Z', 'device_demo_02'),
  ('00000000-0000-4000-8000-000000001118', '00000000-0000-4000-8000-000000000003', 'quinua', 5000, 'entrada', 'member_demo_03', '2026-11-02T09:00:00Z', 'device_demo_03'),
  ('00000000-0000-4000-8000-000000001119', '00000000-0000-4000-8000-000000000003', 'quinua', -1200, 'salida', 'member_demo_03', '2026-11-05T11:00:00Z', 'device_demo_03'),
  ('00000000-0000-4000-8000-000000001120', '00000000-0000-4000-8000-000000000003', 'leche_evaporada', -400, 'merma', 'member_demo_03', '2026-11-06T09:00:00Z', 'device_demo_03'),
  ('00000000-0000-4000-8000-000000001121', '00000000-0000-4000-8000-000000000004', 'azucar', 4000, 'entrada', 'member_demo_04', '2026-11-01T10:00:00Z', 'device_demo_04'),
  ('00000000-0000-4000-8000-000000001122', '00000000-0000-4000-8000-000000000004', 'azucar', 120, 'ajuste', 'member_demo_04', '2026-11-03T16:00:00Z', 'device_demo_04'),
  ('00000000-0000-4000-8000-000000001123', '00000000-0000-4000-8000-000000000004', 'avena', 2500, 'entrada', 'member_demo_04', '2026-11-04T08:30:00Z', 'device_demo_04'),
  ('00000000-0000-4000-8000-000000001124', '00000000-0000-4000-8000-000000000005', 'cebolla', 2000, 'entrada', 'member_demo_05', '2026-11-02T07:30:00Z', 'device_demo_05'),
  ('00000000-0000-4000-8000-000000001125', '00000000-0000-4000-8000-000000000005', 'cebolla', -350, 'merma', 'member_demo_05', '2026-11-05T13:00:00Z', 'device_demo_05'),
  ('00000000-0000-4000-8000-000000001126', '00000000-0000-4000-8000-000000000005', 'atun', 1800, 'entrada', 'member_demo_05', '2026-11-06T08:00:00Z', 'device_demo_05'),
  ('00000000-0000-4000-8000-000000001127', '00000000-0000-4000-8000-000000000006', 'pollo', 8000, 'entrada', 'member_demo_06', '2026-11-03T08:00:00Z', 'device_demo_06'),
  ('00000000-0000-4000-8000-000000001128', '00000000-0000-4000-8000-000000000006', 'pollo', 2500, 'ajuste', 'member_demo_06', '2026-11-04T17:00:00Z', 'device_demo_06'),
  ('00000000-0000-4000-8000-000000001129', '00000000-0000-4000-8000-000000000007', 'tomate', -900, 'transferencia', 'member_demo_07', '2026-11-05T10:00:00Z', 'device_demo_07'),
  ('00000000-0000-4000-8000-000000001130', '00000000-0000-4000-8000-000000000007', 'frijol', 4500, 'entrada', 'member_demo_07', '2026-11-06T08:00:00Z', 'device_demo_07')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Solicitudes demo 1211..1215, una por estado, con 1-2 items cada una.
-- ---------------------------------------------------------------------------
insert into solicitudes (id, olla_origen_id, olla_destino_id, estado, device_id) values
  ('00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'borrador', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001212', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005', 'enviada', 'device_demo_02'),
  ('00000000-0000-4000-8000-000000001213', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000006', 'aceptada', 'device_demo_03'),
  ('00000000-0000-4000-8000-000000001214', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000007', 'entregada', 'device_demo_05'),
  ('00000000-0000-4000-8000-000000001215', '00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000008', 'cancelada', 'device_demo_06')
on conflict (id) do nothing;

insert into solicitud_items (solicitud_id, insumo_id, cantidad, unidad, nota) values
  ('00000000-0000-4000-8000-000000001211', 'pollo', 4, 'kg', 'Pedido demo borrador'),
  ('00000000-0000-4000-8000-000000001211', 'tomate', 2, 'kg', null),
  ('00000000-0000-4000-8000-000000001212', 'frijol', 3, 'kg', 'Pedido demo enviado'),
  ('00000000-0000-4000-8000-000000001213', 'quinua', 2, 'kg', 'Pedido demo aceptado'),
  ('00000000-0000-4000-8000-000000001213', 'avena', 1.5, 'kg', null),
  ('00000000-0000-4000-8000-000000001214', 'arveja', 2, 'kg', 'Pedido demo entregado'),
  ('00000000-0000-4000-8000-000000001215', 'pollo', 5, 'kg', 'Pedido demo cancelado')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- evento_sync demo: 4 eventos coherentes, `entidad` dentro del CHECK,
-- idempotency_key = event_uuid y lamport unico por device.
-- ---------------------------------------------------------------------------
insert into evento_sync
  (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, estado, creado_en)
values
  ('00000000-0000-4000-8000-000000001321', '00000000-0000-4000-8000-000000001321', 10, 'device_demo_04',
   '00000000-0000-4000-8000-000000000004', 'personas',
   '{"codigo_p":"P-0019","categoria":"nino"}'::jsonb, 'aplicado', '2026-11-01T10:30:00Z'),
  ('00000000-0000-4000-8000-000000001322', '00000000-0000-4000-8000-000000001322', 11, 'device_demo_04',
   '00000000-0000-4000-8000-000000000004', 'movimientos',
   '{"id":"00000000-0000-4000-8000-000000001121","delta":4000}'::jsonb, 'aplicado', '2026-11-01T11:00:00Z'),
  ('00000000-0000-4000-8000-000000001323', '00000000-0000-4000-8000-000000001323', 20, 'device_demo_05',
   '00000000-0000-4000-8000-000000000005', 'solicitudes',
   '{"id":"00000000-0000-4000-8000-000000001212","estado":"enviada"}'::jsonb, 'enviado', '2026-11-04T09:00:00Z'),
  ('00000000-0000-4000-8000-000000001324', '00000000-0000-4000-8000-000000001324', 30, 'device_demo_06',
   '00000000-0000-4000-8000-000000000006', 'menus',
   '{"template_id":"00000000-0000-4000-8000-000000000303","estado":"publicado"}'::jsonb, 'pendiente', '2026-11-07T08:00:00Z')
on conflict do nothing;
