-- seed.sql — DATOS FICTICIOS Y MARCADOS. No corresponden a personas ni ollas reales.
-- Se corre con `supabase db reset` (local) o `pnpm db:seed` contra SUPABASE_DB_URL.
-- Idempotente: `on conflict do nothing` y fechas fijas, nunca `now()`.
--
-- Privacidad (docs/DECISIONES.md D2/D7):
--   * No hay identidad personal: las personas son P-0001..P-0006.
--   * Sin documento, sin telefono, sin direccion, sin fotos.
--   * Los valores de salud son ficticios y estan declarados aca como tales.

insert into ollas (id, titulo, codigo, tipo, distrito) values
  ('00000000-0000-4000-8000-000000000001', 'Olla Demo Villa El Salvador', 'DEMHAA', 'comun', 'Villa El Salvador'),
  ('00000000-0000-4000-8000-000000000002', 'Olla Demo San Juan de Lurigancho', 'DEMHBB', 'comun', 'San Juan de Lurigancho'),
  ('00000000-0000-4000-8000-000000000003', 'Comedor Demo Comas', 'DEMHCC', 'comedor_pca', 'Comas')
on conflict (id) do nothing;

-- Hashes de PIN ficticios: bcrypt real de '1234' (docs/adr/0008-enrolamiento.md).
-- No son credenciales utiles (es un PIN demo publico), pero validan con
-- `crypt('1234', pin_hash) = pin_hash`, asi pgTAP y el login local prueban el flujo
-- completo. `gen_salt('bf', 8)` y no el literal para no emparejar datos entre corridas.
-- Idempotente con `on conflict (id) do nothing`: la segunda corrida no re-hashea.
insert into members (id, pin_hash, recovery_hash) values
  ('00000000-0000-4000-8000-000000000101', crypt('1234', gen_salt('bf', 8)), crypt('recovery-demo-01', gen_salt('bf', 8))),
  ('00000000-0000-4000-8000-000000000102', crypt('1234', gen_salt('bf', 8)), crypt('recovery-demo-02', gen_salt('bf', 8)))
on conflict (id) do nothing;

insert into olla_members (member_id, olla_id, rol) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'organizadora'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000002', 'cocinera')
on conflict do nothing;

-- Personas ficticias. Casos borde: gestante con anemia reportada, menor de 5,
-- adulto mayor y una baja logica. Los valores de salud son inventados.
insert into personas
  (codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia, peso_kg, talla_cm,
   consentimiento_seguimiento, notas, device_id)
values
  ('P-0001', '00000000-0000-4000-8000-000000000001', 1992, 'F', 'gestante', 'si', 58.40, 152.00, true, 'Caso demo: gestante con anemia reportada', 'device_demo_01'),
  ('P-0002', '00000000-0000-4000-8000-000000000001', 2022, 'M', 'nino', 'sin_dato', null, null, false, 'Caso demo: menor de 5', 'device_demo_01'),
  ('P-0003', '00000000-0000-4000-8000-000000000001', 1949, 'F', 'adulto_mayor', 'no', null, null, false, 'Caso demo: adulto mayor', 'device_demo_01'),
  ('P-0004', '00000000-0000-4000-8000-000000000002', 1988, 'M', 'adulto', 'sin_dato', null, null, false, null, 'device_demo_02'),
  ('P-0005', '00000000-0000-4000-8000-000000000002', 2001, 'F', 'lactante', 'no', null, null, false, 'Caso demo: lactante', 'device_demo_02'),
  ('P-0006', '00000000-0000-4000-8000-000000000003', 1979, 'X', 'adulto', 'sin_dato', null, null, false, 'Baja logica de demo', 'device_demo_03')
on conflict (codigo_p) do nothing;

update personas set deleted_at = '2026-11-20T10:00:00Z'
where codigo_p = 'P-0006' and deleted_at is null;

insert into insumos
  (id, olla_id, denominacion, grupo, unidad_base, gramos_por_unidad, stock_minimo, perecedero, alergenos, device_id)
values
  ('arroz', '00000000-0000-4000-8000-000000000001', 'Arroz demo', 'cereal', 'g', null, 5000, false, '{}', 'device_demo_01'),
  ('lentejas', '00000000-0000-4000-8000-000000000001', 'Lentejas demo', 'menestra', 'g', null, 3000, false, '{}', 'device_demo_01'),
  ('papa', '00000000-0000-4000-8000-000000000001', 'Papa demo', 'tuberculo', 'g', null, 4000, true, '{}', 'device_demo_01'),
  ('zanahoria', '00000000-0000-4000-8000-000000000001', 'Zanahoria demo', 'verdura', 'g', null, 1000, true, '{}', 'device_demo_01'),
  ('sangrecita', '00000000-0000-4000-8000-000000000001', 'Sangrecita demo', 'viscera', 'g', null, 1000, true, '{}', 'device_demo_01'),
  ('huevo', '00000000-0000-4000-8000-000000000002', 'Huevo demo', 'huevo', 'unidad', 50, 30, true, '{huevo}', 'device_demo_02'),
  ('aceite', '00000000-0000-4000-8000-000000000002', 'Aceite demo', 'grasa', 'ml', null, 1000, false, '{}', 'device_demo_02'),
  ('sal', '00000000-0000-4000-8000-000000000002', 'Sal demo', 'condimento', 'g', null, 500, false, '{}', 'device_demo_02'),
  ('leche_evaporada', '00000000-0000-4000-8000-000000000003', 'Leche evaporada demo', 'lacteo', 'g', null, 2000, false, '{lactosa}', 'device_demo_03'),
  ('quinua', '00000000-0000-4000-8000-000000000003', 'Quinua demo', 'cereal', 'g', null, 2000, false, '{}', 'device_demo_03')
on conflict (id) do nothing;

-- precio: bigint en microcentesimos por unidad base (ADR-0004; comprobantes.md:1231).
-- S/4,20/kg por gramo = 420000. 1 = 10^-6 centimo.
insert into precios (id, olla_id, insumo_id, canal, unidad, precio, fecha, fuente, url) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 'arroz', 'mayorista', 'g', 420000, '2026-11-01', 'demo-ficticio', null),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 'arroz', 'minorista', 'g', 510000, '2026-11-01', 'demo-ficticio', null),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 'lentejas', 'mayorista', 'g', 780000, '2026-11-01', 'demo-ficticio', null),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', 'papa', 'minorista', 'g', 230000, '2026-11-01', 'demo-ficticio', null),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000002', 'huevo', 'minorista', 'unidad', 550000, '2026-11-01', 'demo-ficticio', null),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000003', 'quinua', 'mayorista', 'g', 940000, '2026-11-01', 'demo-ficticio', null)
on conflict (id) do nothing;

-- Menu demo firmado. El hash de cada plantilla es sha256 hex del contenido canonico
-- (`sha256Hex(serializarContenido(template, platos))` en packages/domain/src/servicio.ts):
--   301 general/A -> sha256("menu:<301>|perfil:general|opcion:A|0000…0501|almuerzo|Guiso demo de lentejas|adulto:280:g,gestante:320:g,menor_5:180:g")
--                    = cd78df14a1e79cb92c9eb73047c32220e2aaff23339243d0ca78b524dfbcec39
--   302 especial/A (sin platos en el seed) -> sha256("menu:<302>|perfil:especial|opcion:A|")
--                    = c04067aad4bfd6296660faf68af661c65a733b072661db6e380aff606d93efb7
-- Recalculo: `node /tmp/opencode/calc-hash.mjs` sobre packages/domain/dist. Ver
-- packages/domain/src/servicio-seed.test.ts (fija ambos literales contra el SQL).
insert into menu_template
  (id, olla_id, perfil, opcion, estado, sello_nutricionista, sello_cnp, sello_fecha, version, hash)
values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001',
   'general', 'A', 'publicado', 'Nutricionista Demo', 'CNP-DEMO-0001', '2026-11-01T10:00:00Z', 1,
   'cd78df14a1e79cb92c9eb73047c32220e2aaff23339243d0ca78b524dfbcec39'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001',
   'especial', 'A', 'aprobado', 'Nutricionista Demo', 'CNP-DEMO-0001', '2026-11-01T10:00:00Z', 1,
   'c04067aad4bfd6296660faf68af661c65a733b072661db6e380aff606d93efb7')
on conflict (id) do nothing;

insert into menu_day (id, olla_id, template_id, dia_semana, fecha, version, hash) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000301', 1, '2026-11-23', 1,
   encode(digest('menu-demo-general-A-dia-1', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into dish (id, olla_id, menu_day_id, momento, titulo, version, hash) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000401', 'almuerzo', 'Guiso demo de lentejas', 1,
   encode(digest('dish-demo-guiso-lentejas', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into ingredient (id, olla_id, dish_id, insumo_id, gramos, unidad, version, hash) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000501', 'lentejas', 80, 'g', 1,
   encode(digest('ing-demo-lentejas', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000501', 'papa', 120, 'g', 1,
   encode(digest('ing-demo-papa', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into portion (id, olla_id, dish_id, grupo, cantidad, unidad, version, hash) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000501', 'adulto', 280, 'g', 1,
   encode(digest('portion-demo-adulto', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000501', 'menor_5', 180, 'g', 1,
   encode(digest('portion-demo-menor-5', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000501', 'gestante', 320, 'g', 1,
   encode(digest('portion-demo-gestante', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into menu_constraint (id, olla_id, template_id, tipo, valor, motivo, version, hash) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000302', 'alergia', 'huevo', 'Restriccion demo', 1,
   encode(digest('constraint-demo-huevo', 'sha256'), 'hex')),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000301', 'inocuidad', '75C', 'Checklist de coccion', 1,
   encode(digest('constraint-demo-75c', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into substitution (id, olla_id, template_id, insumo_origen_id, insumo_destino_id, factor, aprobada_por, version, hash) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000302', 'leche_evaporada', 'quinua', 1.20, 'CNP-DEMO-0001', 1,
   encode(digest('subs-demo-leche-quinua', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into validation (id, olla_id, template_id, estado, hallazgos, validador, cnp, fecha, version, hash) values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000301', 'aprobado', '{}', 'Nutricionista Demo', 'CNP-DEMO-0001',
   '2026-11-01T10:00:00Z', 1, encode(digest('validation-demo-general-A', 'sha256'), 'hex'))
on conflict (id) do nothing;

insert into movimientos (id, olla_id, insumo_id, delta, motivo, autor, at, device_id) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000001', 'arroz', 20000, 'entrada', 'member_demo_01', '2026-11-02T08:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000001', 'arroz', -3000, 'salida', 'member_demo_01', '2026-11-03T08:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000000001', 'papa', 5000, 'entrada', 'member_demo_01', '2026-11-04T08:00:00Z', 'device_demo_01'),
  ('00000000-0000-4000-8000-000000001104', '00000000-0000-4000-8000-000000000002', 'huevo', -12, 'merma', 'member_demo_02', '2026-11-04T09:00:00Z', 'device_demo_02')
on conflict (id) do nothing;

insert into solicitudes (id, olla_origen_id, olla_destino_id, estado, device_id) values
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001', 'enviada', 'device_demo_02')
on conflict (id) do nothing;

insert into solicitud_items (solicitud_id, insumo_id, cantidad, unidad, nota) values
  ('00000000-0000-4000-8000-000000001201', 'arroz', 5, 'kg', 'Pedido demo entre ollas')
on conflict do nothing;

insert into evento_sync
  (event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, estado, creado_en)
values
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000001301', 3, 'device_demo_01',
   '00000000-0000-4000-8000-000000000001', 'movimientos',
   '{"id":"00000000-0000-4000-8000-000000001101","delta":20000}'::jsonb, 'aplicado', '2026-11-02T08:00:00Z'),
  ('00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000001302', 4, 'device_demo_02',
   '00000000-0000-4000-8000-000000000002', 'solicitudes',
   '{"id":"00000000-0000-4000-8000-000000001201","estado":"enviada"}'::jsonb, 'pendiente', '2026-11-04T10:00:00Z')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Catalogo de productos y serie por producto (#63, D8).
--
-- `precios` (arriba) sigue siendo la serie por insumo que usa la pantalla; esto
-- agrega el catalogo global y `precio_observado` por producto. Ids de producto =
-- UUIDv5 determinista desde el slug (`hackods:producto:<slug>`), asi el seed es
-- idempotente y el id no cambia entre corridas. `on conflict do nothing` en las
-- tres tablas. Fechas fijas: 2026-11-01..07.
-- ---------------------------------------------------------------------------

insert into producto_catalogo
  (id, slug, nombre, categoria, subcategoria, unidad_base, perecedero,
   peso_variable, activo, version, created_at, updated_at)
values
  ('2ff27c34-b456-5826-b6ed-21437e0b04fc', 'arroz', 'Arroz demo', 'abarrotes', 'cereal', 'g',
   false, false, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('7a7b8d7a-6882-59d0-8b34-fd5e726f137b', 'lentejas', 'Lentejas demo', 'abarrotes', 'menestra', 'g',
   false, false, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('259399ed-9aec-5803-bd8b-2b3fce83283e', 'papa', 'Papa demo', 'verduras', 'tuberculo', 'g',
   true, true, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('7175561e-87b8-5cac-b446-0b1d68b34c89', 'zanahoria', 'Zanahoria demo', 'verduras', 'raiz', 'g',
   true, true, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('6139e37b-2fb3-52c4-be35-35193edd426e', 'sangrecita', 'Sangrecita demo', 'carnes', 'viscera', 'g',
   true, true, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('32efa3b2-9a0b-57ad-8c78-5359bd91970f', 'huevo', 'Huevo demo', 'abarrotes', 'huevo', 'unidad',
   true, false, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
  ('4c0b5238-15b4-5edd-b656-ad10ba418769', 'pollo', 'Pollo demo', 'carnes', 'ave', 'g',
   true, true, true, 1, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')
on conflict (id) do nothing;

-- Serie por producto: 7 observaciones por producto y olla (fechas 2026-11-01..07,
-- canal alternado mayorista/minorista, precio = mediana ± 1000·k microcentesimos por
-- unidad base: la 4a observacion es la mediana exacta). Determinista, sintetico.
-- `precio_microcent_por_base` es el precio final con IGV (comprobantes.md:87).
insert into precio_observado
  (id, olla_id, producto_id, fecha, canal, unidad_base, cantidad_milesimas,
   precio_microcent_por_base, moneda, origen, calidad_evidencia, estado, lamport,
   device_id)
values
  ('e54b26bb-5317-518c-848a-089c80fc8642', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-01', 'mayorista', 'g', 1000, 1200, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_01'),
  ('8b9a9ba8-9aa7-5369-8e45-37cfaf493bf7', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-02', 'minorista', 'g', 1000, 2200, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_01'),
  ('02faf6d5-870d-594f-be57-41a00acb2a1b', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-03', 'mayorista', 'g', 1000, 3200, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_01'),
  ('564bfb75-0b86-5864-accd-6670f614b247', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-04', 'minorista', 'g', 1000, 4200, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_01'),
  ('3905056b-c9ad-5351-b15b-4650a4a62b0b', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-05', 'mayorista', 'g', 1000, 5200, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_01'),
  ('d5e461cb-5239-57aa-99b6-e30d07b7e1be', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-06', 'minorista', 'g', 1000, 6200, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_01'),
  ('7226b0e7-62d8-5e31-975c-309b6ad7c7d5', '00000000-0000-4000-8000-000000000001', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-07', 'mayorista', 'g', 1000, 7200, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_01'),
  ('f4b68568-7bab-5d96-863c-5c5f4c5ac3ca', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-01', 'mayorista', 'g', 1000, 1200, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_02'),
  ('91d892ed-5985-5a24-8d2c-095702654b60', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-02', 'minorista', 'g', 1000, 2200, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_02'),
  ('dc6b1ab3-e628-54b2-b0a9-28bfa618d1d6', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-03', 'mayorista', 'g', 1000, 3200, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_02'),
  ('de29b007-4c73-505f-a07a-9a1f13d11a68', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-04', 'minorista', 'g', 1000, 4200, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_02'),
  ('75e8c431-d310-55a7-8936-bfede8fd05eb', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-05', 'mayorista', 'g', 1000, 5200, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_02'),
  ('81e8f94d-5b1c-540f-85a4-060bdc06b2b1', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-06', 'minorista', 'g', 1000, 6200, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_02'),
  ('95a633f5-d29f-59f0-a3e5-bf8eaeeeead7', '00000000-0000-4000-8000-000000000002', '2ff27c34-b456-5826-b6ed-21437e0b04fc', '2026-11-07', 'mayorista', 'g', 1000, 7200, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_02'),
  ('b27df8ea-8bd2-58cf-ae8b-a179888744fb', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-01', 'mayorista', 'g', 1000, 4800, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_01'),
  ('0261e123-07fe-5259-a763-2744b837bbe4', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-02', 'minorista', 'g', 1000, 5800, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_01'),
  ('b90aec97-94be-575f-879e-7abf2546d546', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-03', 'mayorista', 'g', 1000, 6800, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_01'),
  ('96e62f8e-1dc8-578a-9a20-09ed62013db7', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-04', 'minorista', 'g', 1000, 7800, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_01'),
  ('6d54f3bc-30b8-5c99-a5da-7f7833b60ff8', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-05', 'mayorista', 'g', 1000, 8800, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_01'),
  ('7700089e-bb41-5af6-80be-562eed05fa58', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-06', 'minorista', 'g', 1000, 9800, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_01'),
  ('0edb1746-5eca-535f-9a2e-f787fd60bb19', '00000000-0000-4000-8000-000000000001', '7a7b8d7a-6882-59d0-8b34-fd5e726f137b', '2026-11-07', 'mayorista', 'g', 1000, 10800, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_01'),
  ('e8ed93dc-0907-565f-9d65-c8c62dc997c7', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-01', 'mayorista', 'g', 1000, 700, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_01'),
  ('8af4c9b3-8ba7-5e33-808f-5382c2bd57f7', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-02', 'minorista', 'g', 1000, 300, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_01'),
  ('b9e54e30-ae84-5664-a933-fec3f3a712f3', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-03', 'mayorista', 'g', 1000, 1300, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_01'),
  ('5a365378-a060-56b3-8042-47bbabe2d055', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-04', 'minorista', 'g', 1000, 2300, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_01'),
  ('59fdc154-7cb2-552e-bb9b-09b88ba9a2a6', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-05', 'mayorista', 'g', 1000, 3300, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_01'),
  ('9bbe8ddb-5345-56f7-aa91-4bfbef9322c8', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-06', 'minorista', 'g', 1000, 4300, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_01'),
  ('22881bf4-a03e-5bdb-807d-78206c018a5a', '00000000-0000-4000-8000-000000000001', '259399ed-9aec-5803-bd8b-2b3fce83283e', '2026-11-07', 'mayorista', 'g', 1000, 5300, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_01'),
  ('88a3ccae-2bb4-503e-b9aa-8966dbd7e2a0', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-01', 'mayorista', 'g', 1000, 1500, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_01'),
  ('bfcc5f41-c160-5597-b36e-ec4b119c7ee5', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-02', 'minorista', 'g', 1000, 500, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_01'),
  ('b25840f6-92a6-5ed3-be13-b7d4131d3a20', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-03', 'mayorista', 'g', 1000, 500, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_01'),
  ('73aa90b4-e70d-5141-9d46-9552ebc43721', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-04', 'minorista', 'g', 1000, 1500, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_01'),
  ('739f690f-ebb3-5b3f-881b-3ab8ee02b10e', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-05', 'mayorista', 'g', 1000, 2500, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_01'),
  ('5099982d-61fa-54b0-a7d4-71a52962ad5c', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-06', 'minorista', 'g', 1000, 3500, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_01'),
  ('b37f6bf9-30a0-554b-8fd6-a84ab0877458', '00000000-0000-4000-8000-000000000001', '7175561e-87b8-5cac-b446-0b1d68b34c89', '2026-11-07', 'mayorista', 'g', 1000, 4500, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_01'),
  ('44044514-d6d3-518a-bf1c-5c41e0acdb7a', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-01', 'mayorista', 'g', 1000, 200, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_01'),
  ('ca05356f-7990-5b9c-80b3-56abf16efe76', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-02', 'minorista', 'g', 1000, 1200, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_01'),
  ('d5701f1e-6573-540f-ad9b-8377a9ac2c90', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-03', 'mayorista', 'g', 1000, 2200, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_01'),
  ('c270886c-d55c-5af8-ae3d-8b7d467f4637', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-04', 'minorista', 'g', 1000, 3200, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_01'),
  ('0c61e6cb-cb76-5350-b8a7-63451325b2b3', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-05', 'mayorista', 'g', 1000, 4200, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_01'),
  ('f66e0c44-385a-56b4-b459-f463ed27491e', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-06', 'minorista', 'g', 1000, 5200, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_01'),
  ('a179d530-74fd-557d-9339-6ea4d22cbf10', '00000000-0000-4000-8000-000000000001', '6139e37b-2fb3-52c4-be35-35193edd426e', '2026-11-07', 'mayorista', 'g', 1000, 6200, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_01'),
  ('bfd5093f-9397-5c2b-b8dd-58a63e4b766e', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-01', 'mayorista', 'unidad', 1000, 2500, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_02'),
  ('e1b82fb7-6e5b-52c3-b7e1-a163d2ac5015', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-02', 'minorista', 'unidad', 1000, 3500, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_02'),
  ('5974fcb1-f645-5ed8-abae-5d858fc8e2d4', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-03', 'mayorista', 'unidad', 1000, 4500, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_02'),
  ('6567898a-ff98-53ba-9a3d-8283cbd2cee1', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-04', 'minorista', 'unidad', 1000, 5500, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_02'),
  ('330c9de0-0cc9-5725-a9c2-313269ccdd29', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-05', 'mayorista', 'unidad', 1000, 6500, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_02'),
  ('ad8d703d-df33-5162-bf20-d99a19d9ca41', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-06', 'minorista', 'unidad', 1000, 7500, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_02'),
  ('ef707ceb-02c5-500d-8cc6-1605ecc64461', '00000000-0000-4000-8000-000000000002', '32efa3b2-9a0b-57ad-8c78-5359bd91970f', '2026-11-07', 'mayorista', 'unidad', 1000, 8500, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_02'),
  ('41185563-083d-596c-bd6f-77780a630d43', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-01', 'mayorista', 'g', 1000, 6800, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_01'),
  ('3104df35-adf2-51b2-9899-67b1ec1a95b6', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-02', 'minorista', 'g', 1000, 7800, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_01'),
  ('8c21d4f9-16bd-5260-8ac0-c8c4feb2b113', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-03', 'mayorista', 'g', 1000, 8800, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_01'),
  ('f522a10d-5f96-5483-91c9-b7c0cf95574f', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-04', 'minorista', 'g', 1000, 9800, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_01'),
  ('98ef3535-5ffa-570e-a92c-3cdc274320bb', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-05', 'mayorista', 'g', 1000, 10800, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_01'),
  ('bbcb8189-b230-5649-875c-fd3042f6366e', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-06', 'minorista', 'g', 1000, 11800, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_01'),
  ('9acca944-3c6d-55e5-8f45-e94e689f9cee', '00000000-0000-4000-8000-000000000001', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-07', 'mayorista', 'g', 1000, 12800, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_01'),
  ('2504842a-e941-5db9-a7b4-178e7283a6d6', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-01', 'mayorista', 'g', 1000, 6800, 'PEN',
   'compra', 'papel', 'valido', 1, 'device_demo_02'),
  ('cd556736-8a9d-5aa4-b3b6-a02a4a811496', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-02', 'minorista', 'g', 1000, 7800, 'PEN',
   'compra', 'papel', 'valido', 2, 'device_demo_02'),
  ('2fe735e6-ca2c-5290-9c1a-54aa9633a7ee', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-03', 'mayorista', 'g', 1000, 8800, 'PEN',
   'compra', 'papel', 'valido', 3, 'device_demo_02'),
  ('30a58d41-4402-57de-ae7a-d0716628e308', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-04', 'minorista', 'g', 1000, 9800, 'PEN',
   'compra', 'papel', 'valido', 4, 'device_demo_02'),
  ('cf806a96-cc7c-55b8-a221-e4ca6b9979f2', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-05', 'mayorista', 'g', 1000, 10800, 'PEN',
   'compra', 'papel', 'valido', 5, 'device_demo_02'),
  ('94b04bf8-2f74-5f15-a679-cdbb2b877317', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-06', 'minorista', 'g', 1000, 11800, 'PEN',
   'compra', 'papel', 'valido', 6, 'device_demo_02'),
  ('eaa8b97c-e31f-5599-9888-d8749e90d109', '00000000-0000-4000-8000-000000000002', '4c0b5238-15b4-5edd-b656-ad10ba418769', '2026-11-07', 'mayorista', 'g', 1000, 12800, 'PEN',
   'compra', 'papel', 'valido', 7, 'device_demo_02')
on conflict (id) do nothing;
