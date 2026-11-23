# Contrato — Salud de personas (`personas`, `v_personas_salud`, `v_salud_agregado`)

**Vigente:** sí. Deriva de `docs/DECISIONES.md` D2/D7 y del ADR
[0005-rls-salud](../adr/0005-rls-salud.md); manda sobre `docs/ARQUITECTURA.md` §6.3
cuando difieren.
**Implementación:** `supabase/migrations/20261123170000_rls_salud.sql`;
prueba `supabase/tests/002_rls_salud.sql` (`supabase test db`).

`anemia`, `peso_kg` y `talla_cm` son datos sensibles (Ley 29733, opt-in con
`consentimiento_seguimiento`). No se leen por columna desde `authenticated`: se
leen solo por vista y según el rol de la olla (`app.mi_rol`).

## 1. Qué puede leer cada rol

| Rol de olla | `personas` (columnas) | `v_personas_salud` | `v_salud_agregado` |
|---|---|---|---|
| cocinera | padrón: `codigo_p`, `olla_id`, `anio_nacimiento`, `sexo`, `categoria`, `consentimiento_seguimiento`, `deleted_at` | 0 filas | 0 filas |
| organizadora | ídem | 0 filas | 0 filas |
| nutricionista | ídem | detalle de sus ollas | conteos de sus ollas |
| admin | ídem | detalle de sus ollas | conteos de sus ollas |

Nadie lee directo `anemia`, `peso_kg`, `talla_cm` ni `notas` sobre `personas`.
`insert`/`update` de `personas` no cambian (`personas_insert` sigue exigiendo
`organizadora`/`admin`).

## 2. `public.v_personas_salud`

Columnas: `codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia,
peso_kg, talla_cm, consentimiento_seguimiento, updated_at`.

Filtro interno (no configurable): `deleted_at is null` y `app.mi_rol(olla_id) in
('nutricionista','admin')` y `olla_id in (select app.mis_ollas())`.

```sql
-- request.jwt.claims = {"sub": "<device.user_id>", "role": "authenticated"}
select codigo_p, anemia, peso_kg, talla_cm from public.v_personas_salud;
-- nutricionista: filas de sus ollas | cocinera/organizadora: 0 filas
```

Es `security_invoker = false`: corre como su dueño y **no** aplica la RLS de
`personas`. El `where` es la frontera; un cambio de política de `personas` hay
que replicarlo acá y en `v_salud_agregado` (el test lo cubre).

`v_personas_salud` es el **detalle**: expone `codigo_p` a propósito (seudónimo,
solo nutricionista/admin en sus ollas). El criterio "sin códigos P individuales"
del issue aplica solo a la lectura agregada (§3).

## 3. `public.v_salud_agregado`

Una fila por `(olla_id, categoria)` con `personas`, `con_consentimiento`,
`con_anemia`, `con_medida` y `peso_promedio_kg`. Nunca expone `codigo_p` ni
valores por persona.

```sql
select olla_id, categoria, personas, con_anemia from public.v_salud_agregado;
-- nutricionista: conteos de sus ollas | cocinera/organizadora: 0 filas
```

## 4. Errores esperados

| Consulta | Resultado |
|---|---|
| `select anemia from personas` con cualquier rol | `permission denied for table personas` (SQLSTATE `42501`) |
| `select * from v_personas_salud` como cocinera/organizadora | 0 filas |
| `select * from v_salud_agregado` como cocinera/organizadora | 0 filas |
| PostgREST `select=*` sobre `personas` con columnas sensibles | `42501` por columna: el cliente debe pedir solo las columnas del padrón |

## 5. Cómo se verifica

`supabase test db` → `supabase/tests/002_rls_salud.sql` (16 aserciones,
autocontenidas). Rojo sin la migración: revocar a mano con
`drop view v_personas_salud; drop view v_salud_agregado; grant select on personas
to authenticated;` y repetir; verde al reaplicar la migración.
