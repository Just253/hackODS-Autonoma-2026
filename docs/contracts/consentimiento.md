# Contrato de consentimiento (seguimiento y estadísticas)

**Vigente:** sí. Deriva de `docs/DECISIONES.md` D2/D5 y del issue #74 (informe
Despensa Solidaria, Anexo A). Decide la implementación:
`docs/adr/0009-consentimiento.md`.

El consentimiento **no** es un booleano de `personas`: es una tabla append-only
donde cada firma es una fila. Revocar es una fila nueva; nada se edita ni se
borra desde el cliente.

---

## 0. Reglas que no se negocian

| Regla | Consecuencia |
|---|---|
| Dos permisos separados (`seguimiento`, `estadisticas`) | Firmar uno no implica el otro, ni en la UI ni en el agregado. |
| Append-only | `authenticated` tiene `SELECT` e `INSERT`; `UPDATE`, `DELETE` y `TRUNCATE` dan `42501`. |
| La última firma gana | Se ordena por `(lamport, firmado_en, device_id, id)`; el orden de llegada no decide. |
| Opt-in separado del plato | Negarse no quita la ración. La ración no consulta esta tabla. |
| Sin identidad | `persona_id` es `codigo_p` (`P-XXXX`); nunca nombre, DNI ni teléfono (`DEC-2026-0002`). |
| k ≥ 10 | Un agregado con menos de 10 personas con permiso vigente no emite fila. |
| Una olla por firma | FK compuesta `(olla_id, persona_id)`; una firma no puede apuntar a una persona de otra olla. |

---

## 1. Tabla `consentimiento`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | Generado en el dispositivo (D5). La base no lo inventa. |
| `olla_id` | `uuid` | FK a `ollas`. |
| `persona_id` | `text` | `codigo_p`; FK compuesta con `olla_id`. |
| `tipo` | `text` | `seguimiento` \| `estadisticas`. |
| `otorgado` | `boolean` | `true` = otorgó; `false` = revocó. |
| `version` | `integer` ≥ 1 | Versión del texto firmado. |
| `firmado_en` | `timestamptz` | Instante de la firma (ISO 8601 con zona). |
| `revocado_en` | `timestamptz` \| `null` | Solo en la fila de revocación; igual o posterior a `firmado_en`. |
| `device_id` | `text` | Desempate del reloj de Lamport. |
| `lamport` | `bigint` ≥ 0 | Ordena las firmas; nunca `Date.now()`. |

Consistencia por `check`: una fila es otorgamiento (`otorgado` y
`revocado_en is null`) o revocación (`not otorgado` y `revocado_en not null`).

**Vigente** (lo que usa el agregado) = la última fila de esa persona para
`seguimiento` tiene `otorgado = true` y `revocado_en is null`. Sin filas el
estado es `sin_registro`, que no es lo mismo que `revocado`.

## 2. RLS

| Operación | Quién |
|---|---|
| `SELECT` | Cualquier miembro de la olla (`app.mis_ollas()`). 0 filas de otra olla. |
| `INSERT` | Cualquier miembro de la olla, en su olla. |
| `UPDATE` / `DELETE` / `TRUNCATE` | Nadie desde el cliente (`42501`). |

`supabase/tests/007_consentimiento.sql` cubre la fuga cruzada, el append-only y
la FK compuesta.

## 3. Agregado de salud (`v_salud_agregado`)

Solo cuenta personas con `seguimiento` vigente; `having count(*) >= 10` se
aplica sobre ese conjunto. `con_consentimiento` cuenta el permiso de
`estadisticas` dentro del grupo ya filtrado (es la única lectura que agrega
información sin cambiar las columnas que consume el cliente).

## 4. Eventos de sync

`evento_sync.entidad = 'consentimiento'`. El `payload` es la fila completa
(incluye `ollaId`). La revocación viaja como `op: 'upsert'` de una fila nueva,
**nunca** como `delete`: el servidor no puede borrar la firma anterior.
`supabase/functions/_shared/sync.ts` y `packages/sync` listan la entidad.

## 5. Pantalla

`apps/web/src/features/consentimiento/`: dos casillas separadas con texto en
español peruano, estado visible (`Otorgado`, `Revocado`, `Sin registro`) y un
botón de revocar por permiso. Se guarda en Dexie (`consentimiento`) y en el
outbox en la misma transacción: sin red, la revocación corta el seguimiento al
instante y el evento espera.
