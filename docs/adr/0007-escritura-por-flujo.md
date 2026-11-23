# ADR 0007 — Escritura por flujo: INSERT de precios, servicios y solicitudes; UPDATE de solo `estado`

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** B (area:api), revisa A
- **Issues:** #58

## Contexto

Medido en `pg_policies` antes de este PR: 23 policies y **solo 3 de escritura**
(`personas_insert`, `movimientos_insert`, `evento_sync_insert`). La app no podía
registrar un precio, el servicio del día ni un pedido entre ollas. Rol por flujo
en `docs/ARQUITECTURA.md`: la cocinera *"entrega raciones y movimientos de
despensa"* (:492) y la organizadora hace *"CRUD de personas de su olla,
membresías, ver reportes"* (:491).

## Decisión

Cinco policies, todas con olla **y** rol, sin DELETE en ninguna tabla:
`precios` y `servicios` INSERT para `('cocinera','admin')`; `solicitudes` y
`solicitud_items` INSERT para `('organizadora','admin')` (nace en `borrador`);
`solicitudes` **UPDATE de solo `estado`** (`grant update (estado)` + `revoke
update` de tabla) para organizadora/admin en cualquiera de las dos ollas del
pedido: origen envía y cancela, destino acepta y entrega.

## Alternativas descartadas

- **UPDATE de tabla en `solicitudes`:** un `update ... set olla_destino_id` pasaría
  la policy (RLS es por fila) y cambiaría de quién es el pedido; el column-grant
  lo deja en 42501, con test.
- **Organizadora solo en origen:** el pedido nunca saldría de `enviada`; solo en
  destino, nadie lo mandaría.
- **`personas_insert` como modelo (solo olla, sin rol):** la tabla de roles (§6.3)
  es la frontera que pide el issue; sin el rol, la cocinera crearía solicitudes.
- **Precios/servicios con UPDATE:** contradice la serie inmutable (D4, ADR-0004);
  corregir es una observación nueva con su `fecha` y `fuente`.

## Consecuencias

- Decisión propia: ARQUITECTURA.md no asigna la solicitud a un rol; se elige
  organizadora porque gestiona la relación entre ollas y los reportes. Cambiar de
  rol es una línea en dos policies y su test.
- Las transiciones (`borrador < enviada < aceptada < entregada`, `cancelada`
  terminal) las valida `packages/domain`; la DB solo impide reescribir origen,
  destino, `lamport` o `device_id`.
- Se revoca UPDATE y DELETE en `precios`/`servicios` y DELETE en `solicitudes`
  (append-only, §4.2 regla 5): el `grant all` de Supabase los dejaba abiertos.
- Deuda: `solicitud_items` no exige que el insumo sea de la olla origen.
