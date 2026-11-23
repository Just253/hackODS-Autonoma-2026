-- precios.precio: numeric(12,2) en soles -> bigint en microcentesimos.
--
-- Conforma la columna al canonico del dinero (comprobantes.md §1 y :1231: 1 = 10^-6
-- centimo). Con numeric(12,2) y precios por unidad base (g), el valor se guardaba
-- redondeado a 0.00 (medido tras #33).
--
-- El ALTER convierte SOLO la escala del dinero (S/ -> microcentesimos: x 10^8),
-- deliberadamente sin tocar la semantica de por-unidad: un dato viejo en 'kg'
-- sigue siendo por-kg (la correccion de unidad vive en el seed, que re-siembra
-- en g). Timestamp posterior a 20261123170000 (ya aplicada en main): una migra
-- fechada antes de la ultima aplicada rompe los applies incrementales.
alter table public.precios
  alter column precio type bigint
  using round(precio::numeric * 100000000);

alter table public.precios
  drop constraint if exists precios_precio_check;
alter table public.precios
  add constraint precios_precio_check check (precio >= 0);
