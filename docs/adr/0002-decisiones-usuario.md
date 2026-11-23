# ADR 0002 — Decisiones del usuario (PDF + elección de backend)

- **Estado:** aceptado
- **Fecha:** 2026-11-23
- **Decisores:** usuario del proyecto (3 PDF, 65 páginas) + ensamblado
- **Issues:** ninguno todavía
- **Supersede parcialmente:** ADR-0001 (contratos, nutrición, esquema y alcance)
- **Fuente:** `docs/DECISIONES.md` (D1–D7), que manda sobre PRD, arquitectura, contrato
  nutricional y plan.

## Contexto

La documentación inicial (`01`–`04`) describía requerimientos individuales y un padrón con
identidad sincronizada. El usuario aportó los PDF de ollas/comedores y eligió Supabase con un
contrato de sync propio. Eso cambia identidad, modelo de datos, nutrición y alcance de demo.

## Decisión

1. **Backend:** Supabase (Postgres + RLS + Auth + Storage) + Cloudflare Pages para el front.
   Sin VPS y sin `apps/api`. El sync entra por Edge Functions:
   `POST /sync/push` (lote ≤ 100, `idempotency_key = event_uuid`, orden `(lamport, device_id)`)
   y `GET /sync/pull?since=`. Contrato: `docs/contracts/sync.md`.
2. **Identidad:** el servidor solo conoce `codigoP` (`P-XXXX`). `nombreLocal`/`alias` viven en
   el dispositivo en `IdentidadLocal` con `localOnly: true` y no se serializan. El esquema SQL
   no tiene identidad personal, documento, teléfono ni dirección.
3. **Nutrición:** menú semanal firmado por nutricionista (2 perfiles × 2 opciones, 7 días,
   almuerzo y cena) + porción por grupo. Se retira `calcularRacion(persona)` y todo
   requerimiento individual. El paquete expone `validarMenu`, `porcionParaGrupo`,
   `sustituirInsumo`, `explicar`; un umbral faltante lanza `ContratoInvalido`.
4. **Modelo:** `Olla.tipo ∈ {comun, comedor_pca}`; `Precio` como serie (canal, unidad, fecha,
   fuente, url); familia de menú `menu_template/menu_day/dish/ingredient/portion/
   menu_constraint/substitution/validation` con `version` y `hash`; `movimientos` append-only;
   `evento_sync` como transporte idempotente.
5. **Privacidad:** seeds ficticios y marcados; cero datos de los PDF; sin nombres verosímiles.
6. **Alcance:** demo de 3 minutos (+ anexo de 2). **75 °C** es checklist de inocuidad del
   servicio (`servicios.cocido_a_75c`), no un cálculo.

## Alternativas descartadas

- **Mantener identidad sincronizada:** filtra datos de menores en un repo público y en una base
  compartida; además obliga a RLS por columna. Descartado por D2/Ley 29733.
- **Requerimientos individuales:** convierten al sistema en un dispositivo médico y dependen de
  una tabla que nadie firmó. El menú firmado es defendible y verificable.
- **VPS/`apps/api`:** dos fuentes de verdad y un servidor que nadie va a operar en el hackathon.

## Consecuencias

- `packages/contracts` cambia: `codigoP`, `tipo` de olla, `Precio`, familia de menú, `EventoSync`.
- `packages/domain` pierde `calcularRacion`; `packages/nutrition` reemplaza su contrato.
- `packages/sync` ordena por `(lamport, deviceId)` y limita el lote a 100.
- Migración nueva `20261123150000_modelo_base.sql`; la `0001` queda como marcador (nunca aplicada).
- Edge Functions en Deno, fuera del `tsc` del monorepo: se verifican con `supabase functions serve`.
- Deuda: materializar `evento_sync` sobre las tablas (worker M5) y cifrado local AES-GCM.
