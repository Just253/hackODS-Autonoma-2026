-- seed.sql — SOLO DATOS FICTICIOS. Nada de personas, telefonos ni ollas reales.
--
-- Estado: comentado a proposito. La migracion inicial esta vacia
-- (20261123120000_init.sql) hasta el PR de contratos v1; cuando existan las
-- tablas se descomentan estos inserts. Deben ser idempotentes:
-- `on conflict do nothing`, y `db reset` dos veces deja el mismo estado.
--
-- Convencion de nombres: "Persona Demo NN", "Olla Demo <lugar>".
-- Nunca "de ejemplo" con un nombre que exista en la vida real.

/*
insert into ollas (id, nombre, codigo, distrito) values
  ('00000000-0000-4000-8000-000000000001', 'Olla Demo Villa El Salvador', 'DEMO01', 'Villa El Salvador'),
  ('00000000-0000-4000-8000-000000000002', 'Olla Demo San Juan de Lurigancho', 'DEMO02', 'San Juan de Lurigancho'),
  ('00000000-0000-4000-8000-000000000003', 'Olla Demo Comas', 'DEMO03', 'Comas')
on conflict (id) do nothing;

-- 40 personas ficticias. Casos borde obligatorios:
--   Persona Demo 01  gestante con anemia reportada
--   Persona Demo 02  nino de 2 anios
--   Persona Demo 03  adulto mayor de 75
--   Persona Demo 40  dada de baja (deleted_at no null)
insert into personas (id, olla_id, alias, anio_nacimiento, categoria, anemia) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
   'Persona Demo 01', 1992, 'gestante', 'si'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001',
   'Persona Demo 02', 2024, 'nino', 'sin_dato'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001',
   'Persona Demo 03', 1951, 'adulto_mayor', 'no')
on conflict (id) do nothing;

-- 20 insumos ficticios, 5 recetas, 14 dias de raciones y movimientos,
-- 4 membresias (una por rol) y 2 solicitudes en estados distintos.
*/

-- Sin filas reales hasta que exista el esquema. Este archivo no debe fallar
-- si se corre contra una base vacia.
select 1;
