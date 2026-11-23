# Contrato — Serie de precios (`public.precios`)

> Tabla: `supabase/migrations/20261123150000_modelo_base.sql`, unidad de dinero en
> `20261123180000_precios_escala.sql` (ADR-0004). Canónico de tipos:
> `packages/contracts/src/domain.ts` (`precioSchema`, `unidadBaseSchema`).

## Qué guarda

Una observación: `(insumo, canal, unidad, precio, fecha, fuente, url)`. Serie inmutable:
la tendencia se compara contra la mediana de las últimas N observaciones, no contra un
promedio que un outlier mueva (DECISIONES.md D4).

| Columna | Regla |
|---|---|
| `unidad` | `g \| ml \| unidad` (`unidadBaseSchema`). Nunca `kg`/`lt`: el precio es **por unidad base** (ADR-0003 §6). |
| `precio` | `bigint` en **microcentésimos por unidad base** (1 = 10⁻⁶ céntimo; canónico `comprobantes.md` §1 y `:1231`). S/ 4,20/kg por gramo = `420000`. Con `numeric(12,2)` en soles se medía `arroz \| g \| 0.00` (ADR-0004). |
| `canal` | `mayorista \| minorista` |
| `fecha` | fija y literal en el seed (nunca `now()`); fuente obligatoria. |

En la UI, `apps/web/src/features/precios/formato-precio.ts` pasa microcentésimos a soles
visibles; en dominio, `packages/domain/src/precios/serie.ts` calcula el P50 en la misma
unidad. El campo D8 `precio_observado.precio_microcent_por_base` usa la misma unidad en
otro modelo (comprobantes).

## Cómo se prueba

- `pnpm db:test` (runner de #34) o `supabase test db supabase/tests/004_precios_escala.sql`:
  afirma tipo `bigint` y los valores exactos de la siembra; un reintento con soles pone
  la suite en rojo.
- Datos canónicos de demo: `supabase/seed.sql` (ficticio, idempotente, enteros).
- RLS: `select` restringido por olla (`app.mis_ollas()`), ver `supabase/AGENTS.md`.
