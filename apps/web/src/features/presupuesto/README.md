# Feature: presupuesto

Muestra a la olla cuánto tiene asignado, cuánto gastó, cuánto le queda y la
proyección al cierre, con alertas al 80 % y al 100 % (`DEC-2026-0008`, D8).

- **Lee**: `MovimientoPresupuesto[]` (append-only) y un `CortePresupuesto`.
- **Calcula**: nada. Todo sale de `calcularPresupuesto()` en
  `packages/domain/src/presupuesto/` (reexportado por `dominio.ts`); acá solo
  se formatean céntimos enteros (`formato.ts`) y se redactan los avisos.
- **Escribe**: nada; es pantalla de lectura. Una mutación iría al outbox de
  `@hackods/sync`, nunca directo a Supabase.
- **Estados**: `listo`, `cargando`, `error` (reintento) y `sin-conexion`
  ("pendiente de sincronizar", conservando los números guardados).

La alerta **no bloquea** la pantalla: es un aviso, la tabla sigue visible.
`disponible < 0` se dice "excedido". Sin asignado, el consumo es "sin dato".
Tests: `PresupuestoPantalla.test.tsx` (render a string, cuatro montos, 80 %, 100 %).

**En el cascarón móvil:** en modo simple vive en Más (el modo avanzado lo muestra en la barra).
Asignado, gastado y disponible se leen como cifras grandes; la alerta del 80 %/100 % se muestra
arriba, sin tapar los números.
