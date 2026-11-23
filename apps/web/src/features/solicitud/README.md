# Solicitud (entre ollas)

Pantalla del paso 2:30 del guion. **Qué hace:** muestra el pedido de 20 kg de arroz de otra olla
(`fixtures.ts`, ficticio) y permite enviarlo, aprobarlo, entregarlo o cancelarlo con las funciones
puras de `packages/domain` (`crearSolicitud`/`resolverSolicitud`); al entregar muestra que se generan
los dos movimientos `transferencia` (origen negativo, destino positivo, conservación a 0).
**Qué lee:** `NUEVA_SOLICITUD_DEMO` y `AHORA_DEMO` (props del router). **Qué escribe:** nada —
demo determinista, sin red ni estado global.

**Persistencia:** `SolicitudEntreOllas` no lleva `deviceId`/`lamport`, que la fila de `solicitudes`
exige (`NOT NULL`): los agrega la capa que persiste. Los `id` de los dos movimientos de la entrega
son UUID que el caller provee (`resolverSolicitud(..., { ids })`); el dominio no llama a
`randomUUID()` y nunca interpola ids no-UUID (la columna `movimientos.id` es `uuid`).

**Distribución:** el pedido y sus decisiones son la columna principal; lo que generó la entrega (los
dos deltas) va al costado en escritorio y debajo en el teléfono. Usa los tokens de la app
(`oc-tarjeta`, `oc-estado`): antes mezclaba `gray-*` sueltos y era la única pantalla con otro lenguaje.
