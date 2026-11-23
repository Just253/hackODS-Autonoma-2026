---
description: Resetea la base local y carga datos sintéticos. Solo local.
agent: datos-supabase
---

Prepará el entorno local con el seed de demo. Argumento (opcional): perfil **$ARGUMENTS**
(`minimo`, `demo`; default `demo`).

1. Confirmá que estás en local: `pnpm exec supabase status`. Si el proyecto está linkeado a un remoto,
   **pará** y avisá; no se sigue.
2. `pnpm exec supabase db reset` (aplica migraciones + `supabase/seed.sql`).
3. Cargá el perfil:
   - `minimo`: 1 olla, 3 personas ficticias (P-XXXX), 2 insumos, 1 menú.
   - `demo`: 2 ollas, 30 días de jornadas, 5 recetas, aportes y donaciones, y un caso de conflicto
     (un registro editado en dos dispositivos) para mostrar en la demo.
4. Verificá: `pnpm exec supabase test db` y una consulta que muestre el conteo por olla.
5. Dejá el estado reproducible: mismas fechas relativas a un reloj fijo (`2026-11-01T08:00:00-05:00`),
   no a `now()`.

**Prohibido:** `supabase db push`, `supabase link`, cualquier proyecto remoto o de producción; nombres,
DNI, teléfonos, direcciones o fotos reales; `truncate`/`drop` fuera del reset local; editar migraciones
ya aplicadas para "arreglar" el seed.

**Salida:** comando corrido, conteos por tabla, y la lista de datos que la demo necesita y no existen.
