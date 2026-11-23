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

-- Hashes de PIN ficticios (no son credenciales utiles).
insert into members (id, pin_hash, recovery_hash) values
  ('00000000-0000-4000-8000-000000000101', '$2a$10$demo.demo.demo.demo.demo.demo.demo.demo.demo', 'demo-recovery-01'),
  ('00000000-0000-4000-8000-000000000102', '$2a$10$demo.demo.demo.demo.demo.demo.demo.demo.demo', 'demo-recovery-02')
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

insert into precios (id, olla_id, insumo_id, canal, unidad, precio, fecha, fuente, url) values
  -- precio: bigint en microcentesimos por unidad base (ADR-0004; comprobantes.md:1231).
  -- S/4,20/kg por gramo = 420000. 1 = 10^-6 centimo.
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
