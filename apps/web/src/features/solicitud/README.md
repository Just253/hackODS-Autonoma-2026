# Solicitud (entre ollas)

Pantalla del paso 2:30 del guion. **Qué hace:** muestra el pedido de 20 kg de arroz de otra olla
(`fixtures.ts`, ficticio) y permite enviarlo, aprobarlo, entregarlo o cancelarlo con las funciones
puras de `packages/domain` (`crearSolicitud`/`resolverSolicitud`); al entregar muestra que se generan
los dos movimientos `transferencia` (origen negativo, destino positivo, conservación a 0).
**Qué lee:** `NUEVA_SOLICITUD_DEMO` y `AHORA_DEMO` (props del router). **Qué escribe:** nada —
demo determinista, sin red ni estado global.
