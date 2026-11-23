# ADR 0009 — Consentimiento append-only, dos permisos y agregado con permiso vigente

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** A (area:web), revisa B
- **Issues:** #74

## Contexto

El consentimiento existía como **un booleano** (`personas.consentimiento_seguimiento`)
que el alta fijaba en `false` (`apps/web/src/data/repositorio.ts:126`). Eso no
alcanza para tres requisitos del informe (Despensa Solidaria, Anexo A):

1. **Dos casillas separadas:** seguimiento de salud y estadísticas. Un booleano
   no distingue "sí al seguimiento, no a las estadísticas".
2. **Revocación que gana:** con un booleano, revocar es un `UPDATE`. No queda
   rastro de quién firmó, cuándo ni con qué texto, y dos dispositivos sin red se
   pisan (`updated_at` no ordena: D5 pide `lamport`).
3. **Agregados solo sobre quienes consintieron:** `v_salud_agregado` promediaba
   a todas las personas de la olla; el booleano solo alimentaba la columna
   `con_consentimiento`.

Restricciones del PR: `personas` es el modelo canónico y el sync ya la publica;
no se puede reescribir su forma desde `area:web`. `authenticated` es un solo rol
de base de datos: la frontera por rol se lee con `app.mi_rol()`.

## Decisión

1. **Tabla `consentimiento` append-only** (`supabase/migrations/20261123211500_consentimiento.sql`):
   `id`, `olla_id`, `persona_id` (`codigo_p`), `tipo` (`seguimiento` |
   `estadisticas`), `otorgado`, `version`, `firmado_en`, `revocado_en`,
   `device_id`, `lamport`. Cada firma es una fila; revocar es una fila nueva con
   `otorgado = false`.
2. **Append-only por privilegios, no solo por RLS.** `revoke all` a `anon` y
   `authenticated`, y `grant select, insert` a `authenticated`. `UPDATE`,
   `DELETE` y `TRUNCATE` dan `42501` (mismo criterio que
   `20261123191000_escritura_por_flujo.sql`: RLS protege lo ajeno, no lo propio).
3. **FK compuesta `(olla_id, persona_id)`** contra `personas(olla_id, codigo_p)`.
   Una firma no puede apuntar a una persona de otra olla ni escribiendo como
   dueño de la base; la separación no queda solo en la policy.
4. **RLS:** `SELECT` e `INSERT` para cualquier miembro de la olla. Registrar la
   firma no se limita a organizadora/admin: la cocinera también recibe el "sí"
   en el papel del comedor y es la que está frente a la persona.
5. **La última firma gana**, ordenada por `(lamport desc, firmado_en desc,
   device_id desc, id desc)`. La regla es pura y vive en
   `packages/domain/src/consentimiento.ts` (`otorgar`, `revocar`,
   `estadoConsentimiento`, `estaVigente`), con el reloj y los ids inyectados.
6. **El agregado** (`v_salud_agregado`) hace `join` contra el último
   `seguimiento` vigente; `k >= 10` se aplica al conjunto filtrado.
7. **El alta de persona deja de escribir el booleano a mano.** El campo del
   contrato (`consentimientoSeguimiento`) se **deriva** de la regla con un
   registro vacío: `estaVigente([], 'seguimiento') === false` es "sin registro",
   no un "no" firmado. La verdad es la tabla nueva.
8. **Local primero (Dexie + outbox):** la firma entra a la tabla `consentimiento`
   y al outbox en la misma transacción; la pantalla lee el estado de Dexie, así
   que la revocación corta el seguimiento al instante sin red.
9. **`evento_sync.entidad` admite `consentimiento`** y las dos listas de
   entidades (`packages/sync`, `supabase/functions/_shared/sync.ts`) la
   incluyen; sin eso el evento se rechaza como "entidad desconocida".

## Alternativas descartadas

- **Dos booleanos en `personas`:** no deja historial, revocar es un `UPDATE` y
  el conflicto entre dos dispositivos se resuelve por llegada, no por `lamport`.
- **Reusar `movimientos` con un `motivo = 'consentimiento'`:** mezcla despensa
  con datos personales y el `payload` de salud quedaría en una tabla que la
  cocinera ya puede leer por completo.
- **Solo RLS, sin revocar privilegios:** `authenticated` conserva el
  `grant all` de Supabase y puede reescribir la firma de su propia olla. El test
  007 lo afirma con `42501`.
- **Contar `estadisticas` para el agregado:** el criterio del issue es
  `seguimiento`; contar el otro permiso habría cambiado el alcance del issue y
  no lo que el informe pide.
- **Tocar `personas.consentimiento_seguimiento` con un `UPDATE` al firmar:** no
  hay policy de `UPDATE` en `personas` y el booleano volvería a ser una segunda
  fuente de verdad.

## Consecuencias

- El booleano `personas.consentimiento_seguimiento` queda como campo heredado
  del contrato (el cliente lo sigue leyendo), pero ya no decide nada: ni la
  pantalla, ni el agregado ni la revocación. Retirarlo requiere cambiar
  `personaSchema` (area:contracts) y el seed.
- Una revocación puede dejar un grupo por debajo de k = 10 y suprimir la fila
  del agregado: es lo correcto (no se reconstruye el dato de una persona), y se
  ve en el test 007.
- `con_consentimiento` pasa a contar `estadisticas`. Las 7 columnas de la vista
  no cambian, así que el cliente no se rompe.
- El papel imprimible del Anexo A (con versión y hash) **no entra en este PR**:
  queda para `packages/printing`, que es de otra área y otro write-set.
- Deuda declarada: `packages/sync` y `_shared/sync.ts` son contrato compartido;
  se tocaron una línea cada uno para que la entidad viaje, y el revisor de
  `area:contracts` debe confirmarlo.

## Verificación

- `packages/domain/src/consentimiento.test.ts` — 14 casos (válido, límite,
  inválido, desempates y "la última firma gana").
- `apps/web/src/data/consentimiento.spec.ts` — Dexie + outbox con la red
  apagada, revocación al instante y persistencia tras reabrir la base.
- `apps/web/src/features/consentimiento/ConsentimientoPage.test.tsx` — dos
  casillas, estados en palabras, revocación sin red.
- `supabase/tests/007_consentimiento.sql` — append-only (`42501`), RLS por olla,
  FK compuesta, agregado solo con permiso vigente y `k >= 10`, entidad de sync.
- `supabase/tests/002_rls_salud.sql` — se ajustaron los fixtures: ahora el grupo
  con k = 10 necesita su firma de seguimiento.
