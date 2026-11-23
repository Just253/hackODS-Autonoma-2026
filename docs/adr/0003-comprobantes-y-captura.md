# ADR 0003 — Comprobantes, clasificación y captura por voz

- **Estado:** aceptado
- **Fecha:** 2026-11-23
- **Decisores:** integración de `_hackods-plan/07–10` + `docs/DECISIONES.md`
- **Fuente:** `docs/DECISIONES.md` (D8, D9), `docs/contracts/{comprobantes,clasificacion,captura-voz}.md`, `docs/ARQUITECTURA-COMPUTE.md`

## Contexto

Los diseños 07–10 llegan después de D1–D8 y usan nombres que el repo todavía no tenía: D9 (captura
sin boleta), D10 (dos backends, que `06-decisiones.md` funde dentro de D9) y códigos de aviso que no
coinciden entre el brief de integración y el documento 09. Además, `08` arranca con `τ=0,62`,
mientras que la medición registrada en D8 da `τ=0,69` porque con 0,62 el clasificador confundía
`POLLO VIVO KG` con `pollo_beneficiado`.

## Decisión

1. **Manda `docs/DECISIONES.md`.** Los cuatro documentos se integran como referencia, sin reescribir
   sus reglas; D9 se agrega a `DECISIONES.md` y la separación de backends queda dentro de D9.
2. **Dinero y cantidad como enteros branded** (`Centimos`, `Milesimas`, `Microcentesimos`); los
   estados son uniones literales. Los bordes validan con zod; el dominio no usa `any`.
3. **El parser emite `MONTO_SIN_REPARTIR`** (nombre del brief) y conserva `MONTO_COMPARTIDO` en el
   enum como código deprecado. `PRECIO_AMBIGUO` acompaña a `PRECIO_FUERA_DE_RANGO` en T10.
4. **`TAU=0,69`, `MARGEN=0,04`, `PISO=0,45`** quedan en `clasificacion/config.ts`, calibrados con la
   medición real de `docs/research/11-ollama-embeddings.md` (bge-m3, acc@1 100 %, 45 ítems). Con 0,62
   el clasificador auto-confirmaba `POLLO VIVO KG` como `pollo_beneficiado`. Si cambia el modelo, se
   recalibra en config, no en código.
5. **Presentación sin equivalencia**: "tres bolsas" se expresa como `3000` milésimas de la
   presentación con `unidadBase = null`; el dinero cuenta y la serie de precios no.
6. El precio unitario derivado se expresa **por unidad base** (docena = 12 unidad ⇒ S/ 0,43/unidad).

## Consecuencias

- `packages/contracts` gana `finanzas.ts`, `captura.ts` y `compute.ts`; `packages/domain` gana
  presupuesto, serie de precios, conciliación y parser, con tests sin red.
- El benchmark de clasificación puede cambiar umbrales sin tocar lógica de producto.
- Queda pendiente (siguiente tanda): SQL/migraciones, RLS, enums `declaracion`/`declarado`,
  adaptadores de `ComputePort`, UI y calibración real de τ.
