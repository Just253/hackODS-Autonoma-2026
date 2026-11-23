# Contrato — Firma del nutricionista (`validation`, `menu_template`, `servicios`, `auditoria`)

> Migración: `supabase/migrations/20261123195000_firma_nutricionista.sql` (ADR-0010, #75).
> Decisión de negocio: `docs/DECISIONES.md` D3 (DEC-2026-0003) y DEC-20261123-1349-d04467.

## Qué permite

| Tabla / columna | Operación | Quién | Regla |
|---|---|---|---|
| `validation` | INSERT | `nutricionista`, `admin` de la olla | Sello completo (`validador`, `cnp`, `hash` no vacíos); `estado='aprobado'` prohibido si hay hallazgo `alergia:*` (23514); `template_id` debe ser de la misma olla (23503). Sin UPDATE/DELETE (append-only). |
| `menu_template.estado` | UPDATE (column-grant) | `nutricionista`, `admin` | `borrador→en_revision→aprobado→publicado→retirado`, más `en_revision→borrador` y `aprobado→retirado`. Cualquier otra = 42501. `retirado` terminal. Cualquier otra columna = 42501. |
| `servicios.cocido_a_75c` | UPDATE (column-grant) | `cocinera`, `organizadora`, `admin` | `null` = sin dato; al marcar `true` se sella `inocuidad_verificada_en`. Otras columnas = 42501. |
| `auditoria` | SELECT | cualquier miembro de la olla | Escribe solo el trigger: sin INSERT/UPDATE/DELETE para `authenticated` (42501). |

## Errores

- `42501`: rol/olla incorrectos, transición ilegal, columna no concedida, escritura directa en `auditoria`.
- `23514`: sello incompleto o aprobación con veto de alergia.
- `23503`: `validation.template_id` de otra olla.

## Cómo se prueba

`pnpm db:test` → `supabase/tests/010_firma_nutricionista.sql` (34 asserts, autocontenido).
Rojo revirtiendo en la DB, uno por uno: `drop policy validation_insert`, `drop trigger
menu_template_transicion` / `validation_auditoria` / `menu_template_retiro_auditoria`,
`alter table validation drop constraint validation_veto_alergia`, y devolviendo el
`grant update` de tabla en `menu_template`/`servicios` (cada uno rompe asserts con nombre).
El sello del contenido (estado, fecha, versión, hash contra el menú) es del motor puro:
`packages/nutrition/src/menu.test.ts`.
