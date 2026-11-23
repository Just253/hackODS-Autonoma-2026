# ADR 0010 — Firma del nutricionista: validar, auditar y retirar

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** issue #75, revisa B (datos/RLS)
- **Issues:** #75; decisiones DEC-2026-0003 (menú firmado) y DEC-20261123-1349-d04467 (roles)

## Decisión

`validation` recibe INSERT solo de `nutricionista|admin` de la olla; `menu_template.estado`
se actualiza por column-grant con transiciones `borrador→en_revision→aprobado→publicado→retirado`
validadas por trigger (ilegal = 42501, `retirado` terminal y sin borrar historial);
`servicios.cocido_a_75c` se concede por columna a `cocinera|organizadora|admin` y pasa a
**nullable** (`null` = sin dato, nunca `false` por defecto). Nueva tabla `auditoria` append-only
(select por olla, sin INSERT/UPDATE/DELETE del cliente) escrita por trigger en firmar, transicionar,
retirar y marcar 75 °C. El contenido del menú lo valida `validarMenu` (puro); la base no lo recalcula.

## Alternativas descartadas

- **Auditar en logs de app:** no es evidencia y se pierde (ya descartado en DEC-…-d04467).
- **UPDATE de tabla en `menu_template`:** reescribiría hash/sello; el column-grant lo deja en 42501.
- **`cocido_a_75c not null default false`:** un `false` de relleno mentiría ("no se midió" ≠ "no se cocinó").

## Consecuencias

- `auditoria.actor` guarda `auth.uid()`, no `member_id` (D2 y #62: `members` ya no es legible).
  Desviación declarada de `docs/ARQUITECTURA.md:813`.
- `app.validation_misma_olla` y `app.auditoria_log` son `security definer` con `search_path` fijo:
  como invoker, la RLS ocultaba la plantilla y la firma legítima fallaba 23503.
- Fuera de alcance: la pantalla del nutricionista (`apps/web`).
