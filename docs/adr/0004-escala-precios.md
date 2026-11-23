# ADR 0004 — `precios.precio` en microcentésimos (`bigint`)

- **Estado:** aceptado
- **Fecha:** 2026-11-23
- **Decisores:** @ImBoolean-2 (claim #2/#5), revisión del lead en #15 (P1-2)
- **Issues:** #2 (deuda documentada), escala extraída de la revisión

## Contexto

La tabla `precios` (D4, serie) guardaba el precio como `numeric(12,2)` en soles. Con el
paso a unidad base (`g`, ADR-0003 §6 y `unidadBaseSchema`), el precio por gramo de la
canasta (S/ 0,0023–0,0094) no cabe en 2 decimales: se midió en la DB local que el seed
corregido guardaba `arroz | g | 0.00`. Mientras tanto, el contrato canónico del dinero
(`docs/contracts/comprobantes.md:64` y `:1231`) ya fija **"dinero en céntimos enteros,
cantidades en milésimas, precios en microcentésimos por unidad base"**, y el código ya
convive con esa unidad: `packages/domain/src/precios/serie.ts` ("P50 estable en
microcentésimos") y la pantalla de precios fusionada
(`apps/web/src/features/precios/formato-precio.ts`, "microcentésimos del repo").

## Decisión

`alter table precios alter column precio type bigint` con `using round(precio * 100000000)`
(conversión de escala de dinero: S/ → µ¢ es ×10⁸; la semántica por-unidad corresponde al seed):
la serie guarda **microcentésimos por unidad base** (S/ 4,20/kg = `420000` por g),
conforme al canónico. El seed se re-siembra en enteros (420000, 510000, 780000, 230000,
550000, 940000). `precioSchema` (Zod) sigue siendo `z.number()`; su unidad queda
documentada en `docs/contracts/precios.md`.

## Alternativas descartadas

- **`numeric(12,4)` en soles:** contradecía el canónico (`comprobantes.md:1231`) que la
  propia revisión del lead citó como P1-2, y desalineaba con `formato-precio.ts` y
  `serie.ts`, que ya esperan microcentésimos. Además, floats para dinero.
- **`numeric(12,6)`:** mismo problema de unidad, con más decimales.
- **Mantener `numeric(12,2)`:** el precio por gramo muere redondeado a 0.00 (medido).

## Consecuencias

- El canónico NO se supersede: **se conforma a él**; la contradicción código/contrato
  que señalaba la revisión queda resuelta sin tocar `comprobantes.md`.
- `precio_observado` (D8, aún sin SQL) mantiene su campo propio
  `precio_microcent_por_base bigint`: misma unidad, modelo distinto.
- El test `supabase/tests/004_precios_escala.sql` afirma tipo (`bigint`) y valores
  exactos: un reintento con soles o un redondeo ponen la suite en rojo.
- Datos existentes: solo hay seed demo (idempotente, re-siembra en el mismo PR).
