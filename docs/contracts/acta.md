# Contrato — Acta de intercambio entre ollas (#76)

> Tipos: `packages/contracts/src/acta.ts` · lógica pura: `packages/domain/src/acta.ts`.
> La tabla SQL y la pantalla van en PRs aparte; este contrato fija lo que cruza paquetes.

## Acta

| Campo | Regla |
|---|---|
| `estado` | `borrador → en_revision → firmada | anulada` |
| `codigo` | 4 dígitos (`^\d{4}$`); **única por `(ollaOrigenId, codigo)`** (dos actas del mismo saco cuentan una) |
| `hash` | SHA-256 hex de la serialización canónica ordenada de ítems+firmas |
| `firmas` | exactamente **dos** (`firmaActaSchema`: olla, rol, llave, fecha), sin PII |
| `items` | insumo, lote opcional, cantidad > 0, unidad base (`g|ml|unidad`) |

## Operaciones puras

- `firmarActa(acta, firma, ahora)` — exige `borrador|en_revision`; con dos firmas distintas pasa a `firmada`; si no, `ActaNoFirmable` con el motivo.
- `movimientosDeActa(acta, ids)` — par `transferencia`: origen `-cantidad`, destino `+cantidad`; **suma 0** (una acta no crea stock).
- `matchExcedentes(excedentes, necesidades)` — score `0,5·urgencia + 0,3·cercanía + 0,2·necesidad`, top 5 con `razones[]` legibles; determinista.
- `impactoDesdeActas(actas, precios?)` — kg rescatados, raciones, compost (14,5 %) y soles **solo de actas `firmada`**; movimientos sueltos y mermas **no suman**.

## Sin red

Todas son funciones puras: firmar y calcular no hace I/O. La cola de sync y la reconciliación viven en `packages/sync` y en `evento_sync` (contrato `sync.md`).
