-- precios.precio: numeric(12,2) en soles -> bigint en microcentesimos por unidad base.
--
-- Conforma la tabla al contrato canonico del dinero (comprobantes.md §1 y :1231:
-- "dinero en centimos enteros, cantidades en milesimas, precios en microcentesimos
-- por unidad base"). El motivo inmediato: con numeric(12,2) el precio por gramo de
-- la canasta (S/0,0023-0,0094/g) se guardaba redondeado a 0.00 (medido en la DB
-- local tras #33), y la serie pierde su magnitud.
--
-- Conversion: 1 = 10^-6 centimo. S/4,20/kg por gramo = 420000 microcentesimos.
-- El dato demo se re-siembra desde seed.sql en el mismo PR: la conversion de la
-- columna solo protege contra reinserts con soles.
alter table public.precios
  alter column precio type bigint
  using round(precio::numeric * 1000000);

-- Los valores negativos dejan de ser representables: el check acompana al tipo.
alter table public.precios
  drop constraint if exists precios_precio_check;
alter table public.precios
  add constraint precios_precio_check check (precio >= 0);
