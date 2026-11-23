# Contrato — Serie de precios (`public.precios`)

> Tabla: `supabase/migrations/20261123150000_modelo_base.sql`, escala en
> `20261123160000_precios_escala.sql` (ADR-0004). Canónico de tipos:
> `packages/contracts/src/domain.ts` (`precioSchema`, `unidadBaseSchema`).

## Qué guarda

Una observación: `(insumo, canal, unidad, precio, fecha, fuente, url)`. Serie inmutable:
la tendencia se compara contra la mediana de las últimas N observaciones, no contra un
promedio que un outlier mueva (DECISIONES.md D4).

| Columna | Regla |
|---|---|
| `unidad` | `g \| ml \| unidad` (`unidadBaseSchema`). Nunca `kg`/`lt`: el precio es **por unidad base** (ADR-0003 §6). |
| `precio` | `numeric(12,4)`. El precio por gramo de la canasta (0,0023–0,0094) no cabe en 2 decimales: con `numeric(12,2)` se midió `arroz \| g \| 0.00`. Ampliación en `20261123160000_precios_escala.sql` (ADR-0004). |
| `canal` | `mayorista \| minorista` |
| `fecha` | fija y literal en el seed (nunca `now()`); fuente obligatoria. |

## Cómo se prueba

- `pnpm db:test` → `supabase/tests/001_seed_idempotente.sql` afirma conteos **y valores
  exactos** tras re-sembrar: un redondeo de escala vuelve el suite rojo.
- Datos canónicos de demo: `supabase/seed.sql` (ficticio, idempotente).
- RLS: `select` restringido por olla (`app.mis_ollas()`), ver `supabase/AGENTS.md`.
