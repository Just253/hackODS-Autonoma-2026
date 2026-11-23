# ADR 0004 — Escala de `precios.precio` a `numeric(12,4)`

- **Estado:** aceptado
- **Fecha:** 2026-11-23
- **Decisores:** @ImBoolean-2 (claim #2), revisión interna pre-push
- **Issues:** #2

## Contexto

ADR-0003 §6 fija que el precio unitario derivado se expresa **por unidad base**, y
`unidadBaseSchema` (`packages/contracts/src/domain.ts`) solo acepta `g | ml | unidad`.
Pero la columna `precios.precio` se creó como `numeric(12,2)`
(`supabase/migrations/20261123150000_modelo_base.sql:107`). El precio por gramo de la
canasta demo (arroz S/ 0,0042/g, papa S/ 0,0023/g) no cabe en 2 decimales: se midió en la
DB local que `db reset` con el seed corregido guarda `arroz | g | 0.00` — la serie pierde
su magnitud y ningún check salta. Los tests de conteo y la paridad contra Zod daban
verde sobre datos ya corruptos (falso verde, hallado en revisión interna).

## Decisión

`alter table precios alter column precio type numeric(12,4)` en una migración
forward-only (`20261123160000_precios_escala.sql`); el seed expresa los precios por
unidad base y `supabase/tests/001_seed_idempotente.sql` afirma los **valores** exactos
además de los conteos, para que un redondeo vuelva a poner el suite en rojo.

## Alternativas descartadas

- **Guardar por kg:** rompe `unidadBaseSchema` y ADR-0003 §6; reabre el problema que el
  contrato cierra.
- **`numeric(12,6)`:** margen que la canasta no usa (0,0023–0,0094 cabe en 4 decimales);
  si aparece un precio por ml menor que 0,0001, se amplia en otra migración.
- **Enteros branded (`Milesimas`) para la serie:** cambio de contrato mayor (tipo
  `Precio` en TS y SQL), fuera del alcance de #2.

## Consecuencias

- La escala aplica a toda la serie de precios, no solo al seed.
- `db reset` aplica la migración; ningún dato existente pierde valor (12,2 → 12,4 es
  ampliación).
- El pgTAP 001 queda como guardián de valores: quitar la migración o re-redondear lo
  pone en rojo.
