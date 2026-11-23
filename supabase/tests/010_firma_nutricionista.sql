-- Firma del nutricionista (#75, D3/DEC-2026-0003): validar, auditar y retirar.
--
-- Criterios del issue, uno por bloque (cada uno tiene su rojo→verde revirtiendo
-- 20261123195000_firma_nutricionista.sql a mano y corriendo esta suite):
--   1. `validation`: INSERT solo para nutricionista/admin de la olla; la cocinera
--      recibe 42501. Sin sello (`validador`/`cnp`/`hash`) no entra (constraint).
--   2. Alergia = veto: `validation.estado = 'aprobado'` con un hallazgo de alergia
--      es un constraint; se firma `rechazado` con el hallazgo y el veto queda escrito.
--   3. `menu_template.estado`: transiciones legales borrador→en_revision→aprobado
--      →publicado→retirado; una ilegal lanza 42501 con el estado; `retirado` es
--      terminal (y retirar no borra: la fila sigue). UPDATE de `estado` es
--      column-grant: cualquier otra columna, 42501.
--   4. `servicios`: la cocinera persiste `cocido_a_75c` y su hora; NULL = sin dato;
--      nunca puede tocar `tipo`, `fecha` ni la marca de sync (column-grant).
--   5. `auditoria`: append-only escrita por trigger al firmar, transicionar y
--      retirar; SELECT por olla; sin UPDATE ni DELETE desde el cliente (42501).
--
-- Autocontenido (patrón 002/005): crea sus ollas, members, devices, insumos y
-- platos con uuid fijos; no depende del seed. El `hash` es un sha256 hex sintético;
-- el sello del menú (estado/fecha/versión/hash contra el contenido) es del motor
-- puro (`packages/nutrition/src/menu.ts`, probado en `menu.test.ts`): acá solo se
-- prueba lo que la base decide (quién firma, qué transición, qué queda auditado).

begin;

set local search_path to extensions, pg_temp, public;

select plan(41);

-- ---------------------------------------------------------------------------
-- Fixtures: olla P (nutricionista, cocinera y organizadora), olla Q (ajena).
-- ---------------------------------------------------------------------------
insert into ollas (id, titulo, codigo, tipo, distrito)
values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'olla P (test 010)', 'ZZC2TT', 'comun', 'test'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'olla Q (test 010)', 'ZZC3TT', 'comun', 'test');

insert into members (id, pin_hash, recovery_hash)
values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'hash-nutri-p', 'rec-nutri-p'),
  ('bbbbbbbb-0000-4000-8000-0000000000e2', 'hash-cocinera-p', 'rec-cocinera-p'),
  ('bbbbbbbb-0000-4000-8000-0000000000e3', 'hash-organiza-p', 'rec-organiza-p'),
  ('bbbbbbbb-0000-4000-8000-0000000000e4', 'hash-nutri-q', 'rec-nutri-q');

insert into devices (user_id, member_id)
values
  ('90000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000e1'),
  ('90000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000e2'),
  ('90000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-0000000000e3'),
  ('90000000-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-0000000000e4');

insert into olla_members (member_id, olla_id, rol)
values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'nutricionista'),
  ('bbbbbbbb-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'cocinera'),
  ('bbbbbbbb-0000-4000-8000-0000000000e3', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'organizadora'),
  ('bbbbbbbb-0000-4000-8000-0000000000e4', 'aaaaaaaa-0000-4000-8000-0000000000e2', 'nutricionista');

-- Plantilla del menú en cada olla. `hash` sintético: es el que viaja al sello.
insert into menu_template (id, olla_id, perfil, opcion, estado, version, hash)
values
  ('cccccccc-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   'general', 'A', 'borrador', 1, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
  ('cccccccc-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-0000000000e2',
   'general', 'A', 'borrador', 1, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

insert into insumos (id, olla_id, denominacion, grupo, unidad_base, device_id)
values
  ('zz-test010-papa', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'Papa (test 010)', 'tuberculo', 'g', 'dev-p');

insert into menu_day (id, olla_id, template_id, dia_semana, fecha, version, hash)
values
  ('dddddddd-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   'cccccccc-0000-4000-8000-0000000000e1', 1, '2026-11-23', 1,
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

insert into dish (id, olla_id, menu_day_id, momento, titulo, version, hash)
values
  ('dddddddd-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   'dddddddd-0000-4000-8000-0000000000e1', 'almuerzo', 'Guiso test 010', 1,
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

-- Restricción de alergia de la plantilla: cruza `papa` (el `valor` es el insumo).
insert into menu_constraint (id, olla_id, template_id, tipo, valor, motivo, version, hash)
values
  ('eeeeeeee-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   'cccccccc-0000-4000-8000-0000000000e1', 'alergia', 'zz-test010-papa', 'test 010', 1,
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

-- El servicio del día para el checklist de 75 °C (olla P) y uno de la olla Q para
-- probar que la cocinera de P no lo alcanza. Ambos como dueño, antes de cambiar rol.
insert into servicios (id, olla_id, fecha, tipo, device_id)
values
  ('ffffffff-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000e1',
   '2026-11-23', 'almuerzo', 'dev-p'),
  ('ffffffff-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-0000000000e2',
   '2026-11-23', 'almuerzo', 'dev-q');

-- El servicio de P se registró sin medir: `null` = sin dato (no `false`).
update servicios set cocido_a_75c = null where id = 'ffffffff-0000-4000-8000-0000000000e1';

-- ---------------------------------------------------------------------------
-- 1. Privilegios por columna (estable como postgres, dueño de las tablas).
-- ---------------------------------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.menu_template', 'estado', 'update'),
  'authenticated tiene UPDATE de menu_template.estado'
);

select ok(
  not has_column_privilege('authenticated', 'public.menu_template', 'hash', 'update'),
  'authenticated NO tiene UPDATE de menu_template.hash (column-grant)'
);

select ok(
  has_column_privilege('authenticated', 'public.servicios', 'cocido_a_75c', 'update'),
  'authenticated tiene UPDATE de servicios.cocido_a_75c'
);

select ok(
  not has_column_privilege('authenticated', 'public.servicios', 'tipo', 'update'),
  'authenticated NO tiene UPDATE de servicios.tipo (column-grant)'
);

select ok(
  not has_table_privilege('authenticated', 'public.auditoria', 'update'),
  'authenticated NO tiene UPDATE de auditoria (append-only)'
);

select ok(
  not has_table_privilege('authenticated', 'public.auditoria', 'delete'),
  'authenticated NO tiene DELETE de auditoria (append-only)'
);

select ok(
  not has_table_privilege('authenticated', 'public.auditoria', 'insert'),
  'authenticated NO tiene INSERT de auditoria (la escribe el trigger)'
);

-- ---------------------------------------------------------------------------
-- 2. Cocinera de P: no firma (RLS) y no transiciona estados.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.validation (olla_id, template_id, estado, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000e1',
            'aprobado', 'Nutricionista Test', 'CNP-DEMO-0001',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')$$,
  '42501', null,
  'cocinera P: firmar un menú lanza 42501 (firma el nutricionista)'
);

with tocadas as (
  update public.menu_template set estado = 'en_revision'
  where id = 'cccccccc-0000-4000-8000-0000000000e1'
  returning id
)
select is(
  (select count(*) from tocadas),
  0::bigint,
  'cocinera P: mover el estado del menú afecta 0 filas (RLS por rol)'
);

-- ---------------------------------------------------------------------------
-- 3. Nutricionista de P: firma, audita y transiciona.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.validation (olla_id, template_id, estado, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000e1',
            'aprobado', 'Nutricionista Test', 'CNP-DEMO-0001', '')$$,
  '23514', null,
  'nutricionista P: firmar sin hash lanza 23514 (menú sin sello no entra)'
);

select throws_ok(
  $$insert into public.validation (olla_id, template_id, estado, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000e1',
            'aprobado', 'Nutricionista Test', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')$$,
  '23514', null,
  'nutricionista P: firmar sin CNP lanza 23514 (sello incompleto)'
);

select throws_ok(
  $$insert into public.validation (olla_id, template_id, estado, hallazgos, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000e1',
            'aprobado', array['alergia:zz-test010-papa'], 'Nutricionista Test', 'CNP-DEMO-0001',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')$$,
  '23514', null,
  'nutricionista P: aprobar un menú con hallazgo de alergia lanza 23514 (veto no se firma como aprobado)'
);

select lives_ok(
  $$insert into public.validation (olla_id, template_id, estado, hallazgos, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000e1',
            'rechazado', array['alergia:zz-test010-papa'], 'Nutricionista Test', 'CNP-DEMO-0001',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')$$,
  'nutricionista P: firma el rechazo con el hallazgo de alergia (el veto queda escrito)'
);

select is(
  (select count(*) from public.auditoria
    where entidad = 'validation' and accion = 'firmar'
      and olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'),
  1::bigint,
  'auditoria: la firma deja una fila con accion firmar'
);

select is(
  (select actor from public.auditoria where entidad = 'validation' and accion = 'firmar'),
  '90000000-0000-4000-8000-000000000001',
  'auditoria: la firma queda atribuida al nutricionista (actor = auth.uid())'
);

select throws_ok(
  $$insert into public.validation (olla_id, template_id, estado, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e2', 'cccccccc-0000-4000-8000-0000000000e2',
            'aprobado', 'Nutricionista Test', 'CNP-DEMO-0001',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')$$,
  '42501', null,
  'nutricionista P: firmar el menú de la olla Q lanza 42501 (policy por olla)'
);

-- Transiciones legales del nutricionista.
select lives_ok(
  $$update public.menu_template set estado = 'en_revision'
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  'nutricionista P: borrador → en_revision'
);

select throws_ok(
  $$update public.menu_template set estado = 'publicado'
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'nutricionista P: en_revision → publicado lanza 42501 (salta aprobado)'
);

select lives_ok(
  $$update public.menu_template set estado = 'aprobado'
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  'nutricionista P: en_revision → aprobado'
);

select lives_ok(
  $$update public.menu_template set estado = 'publicado'
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  'nutricionista P: aprobado → publicado'
);

select is(
  (select count(*) from public.auditoria
    where entidad = 'menu_template' and accion = 'transicion'
      and entidad_id = 'cccccccc-0000-4000-8000-0000000000e1'),
  3::bigint,
  'auditoria: cada transición deja una fila (3 con sus antes y después)'
);

-- `at` es `now()`, idéntico en la misma transacción: se afirma el CONJUNTO de
-- transiciones, no "la última fila" (que no tiene orden estable aquí).
select is(
  (select string_agg(distinct despues->>'estado', ',' order by despues->>'estado')
   from public.auditoria
   where entidad = 'menu_template' and accion = 'transicion'
     and entidad_id = 'cccccccc-0000-4000-8000-0000000000e1'),
  'aprobado,en_revision,publicado',
  'auditoria: cada `despues` guarda el estado alcanzado (aprobado, publicado)'
);

select throws_ok(
  $$update public.menu_template set hash = repeat('0', 64)
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'nutricionista P: UPDATE de menu_template.hash lanza 42501 (column-grant)'
);

-- Retirar: legal, terminal y sin borrar historial.
select lives_ok(
  $$update public.menu_template set estado = 'retirado'
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  'nutricionista P: publicado → retirado'
);

select is(
  (select count(*) from public.auditoria
    where entidad = 'menu_template' and accion = 'retirar'
      and entidad_id = 'cccccccc-0000-4000-8000-0000000000e1'),
  1::bigint,
  'auditoria: retirar deja su propia fila (accion retirar)'
);

select throws_ok(
  $$update public.menu_template set estado = 'borrador'
    where id = 'cccccccc-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'nutricionista P: retirado → borrador lanza 42501 (retirado es terminal)'
);

select is(
  (select count(*) from public.menu_template
    where id = 'cccccccc-0000-4000-8000-0000000000e1' and estado = 'retirado'),
  1::bigint,
  'retirar no borra: la plantilla sigue con su estado retirado'
);

-- ---------------------------------------------------------------------------
-- 4. Cocinera de P: checklist de 75 °C (column-grant, NULL = sin dato).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select cocido_a_75c from public.servicios where id = 'ffffffff-0000-4000-8000-0000000000e1'),
  null::boolean,
  'servicio con cocido_a_75c NULL = sin dato (no es false)'
);

select lives_ok(
  $$update public.servicios set cocido_a_75c = null
    where id = 'ffffffff-0000-4000-8000-0000000000e1'$$,
  'cocinera P: persistir NULL (sin dato) no rompe'
);

select lives_ok(
  $$update public.servicios set cocido_a_75c = true
    where id = 'ffffffff-0000-4000-8000-0000000000e1'$$,
  'cocinera P: marca el servicio como cocido a 75 °C'
);

select is(
  (select cocido_a_75c from public.servicios where id = 'ffffffff-0000-4000-8000-0000000000e1'),
  true,
  'cocinera P: el checklist quedó persistido'
);

select isnt(
  (select inocuidad_verificada_en from public.servicios where id = 'ffffffff-0000-4000-8000-0000000000e1'),
  null::timestamptz,
  'cocinera P: marcar 75 °C sella la hora de verificación'
);

select throws_ok(
  $$update public.servicios set tipo = 'cena'
    where id = 'ffffffff-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'cocinera P: UPDATE de servicios.tipo lanza 42501 (column-grant)'
);

select throws_ok(
  $$update public.servicios set cocido_a_75c = false, device_id = 'dev-otro'
    where id = 'ffffffff-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'cocinera P: UPDATE de 75 °C junto a otra columna lanza 42501 (column-grant)'
);

-- Olla ajena: la cocinera de P no ve servicios de Q, así que el UPDATE afecta 0 filas.
with tocadas as (
  update public.servicios set cocido_a_75c = true
  where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e2'
  returning id
)
select is(
  (select count(*) from tocadas),
  0::bigint,
  'cocinera P: marcar 75 °C en un servicio de la olla Q afecta 0 filas (RLS por olla)'
);

-- ---------------------------------------------------------------------------
-- 5. Append-only de la auditoría y fuga cruzada.
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.auditoria
    where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'),
  6::bigint,
  'auditoria legible por la cocinera de la olla (1 firma + 3 transiciones + 1 retiro + 1 checklist)'
);

select throws_ok(
  $$update public.auditoria set accion = 'otra'
    where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'auditoria: UPDATE lanza 42501 (append-only)'
);

select throws_ok(
  $$delete from public.auditoria
    where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$,
  '42501', null,
  'auditoria: DELETE lanza 42501 (append-only)'
);

select throws_ok(
  $$insert into public.auditoria (olla_id, actor, accion, entidad, entidad_id)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'falso', 'firmar', 'validation',
            'cccccccc-0000-4000-8000-0000000000e1')$$,
  '42501', null,
  'auditoria: el cliente no escribe a mano (la escribe el trigger)'
);

-- Nutricionista de Q: no ve ni firma nada de P.
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);

select is(
  (select count(*) from public.auditoria
    where olla_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'),
  0::bigint,
  'nutricionista Q: no ve la auditoría de la olla P (policy por olla)'
);

select throws_ok(
  $$insert into public.validation (olla_id, template_id, estado, validador, cnp, hash)
    values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'cccccccc-0000-4000-8000-0000000000e1',
            'rechazado', 'Nutricionista Q', 'CNP-DEMO-0002',
            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')$$,
  '42501', null,
  'nutricionista Q: firmar en la olla P lanza 42501 (policy por olla)'
);

select * from finish();

rollback;
