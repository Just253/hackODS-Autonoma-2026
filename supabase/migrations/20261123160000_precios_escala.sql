-- Escala de precios.precio: numeric(12,2) -> numeric(12,4).
--
-- Motivo (ADR-0004): el precio se expresa por unidad base (g|ml|unidad, ADR-0003
-- seccion 6 y unidadBaseSchema) y el precio por gramo de la canasta demo
-- (0.0023-0.0094) no cabe en 2 decimales: numeric(12,2) lo redondea a 0.00 y la
-- serie pierde su magnitud. Solo se amplia la escala; el check (precio >= 0) y
-- el resto del modelo quedan igual.
alter table public.precios
  alter column precio type numeric(12, 4);
