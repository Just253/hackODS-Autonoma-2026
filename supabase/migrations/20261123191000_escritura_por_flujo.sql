-- Escritura por flujo: policies INSERT de precios, servicios y solicitudes,
-- y UPDATE de SOLO `estado` en solicitudes (#58, ADR-0007).
--
-- Medido antes de este PR (`pg_policies`): 23 policies, 3 de escritura
-- (`personas_insert`, `movimientos_insert`, `evento_sync_insert`). Las 17
-- restantes solo SELECT: la app no podía registrar un precio, el servicio del
-- día ni crear una solicitud entre ollas. Se abren cinco puertas y nada más.
--
-- Roles (docs/ARQUITECTURA.md:492): la cocinera "entrega raciones y movimientos
-- de despensa" — observa precios y registra el servicio. La organizadora
-- (:491) "CRUD de personas, membresías, reportes" — administra la solicitud.
-- Nada de DELETE en ninguna tabla: append-only (ARQUITECTURA.md §4.2 regla 5,
-- el borrado es `deleted_at` y ninguna de estas columnas se borra).
--
-- A diferencia de `personas_insert` y `movimientos_insert` (que solo filtran
-- por olla), estas policies filtran también por rol: la tabla de roles es la
-- frontera que el issue pide respetar. `admin` entra siempre (es el equipo).

-- 1. precios: INSERT por olla y rol. Sin UPDATE: la serie es inmutable (D4,
--    ADR-0004): un precio corregido es una observación nueva con su `fecha`,
--    `canal` y `fuente`; el histórico no se reescribe. Sin DELETE.
create policy precios_insert on public.precios for insert to authenticated
  with check (olla_id in (select app.mis_ollas())
              and app.mi_rol(olla_id) in ('cocinera', 'admin'));

-- 2. servicios: INSERT por olla y rol (el servicio del día). No se edita: la
--    corrección de un servicio es otro registro con su `fecha`.
create policy servicios_insert on public.servicios for insert to authenticated
  with check (olla_id in (select app.mis_ollas())
              and app.mi_rol(olla_id) in ('cocinera', 'admin'));

-- 3. solicitudes: la organizadora abre el pedido en `borrador` desde SU olla
--    (`olla_origen_id`). `olla_destino_id` no se comprueba contra
--    `mis_ollas()`: pedir es hablarle a una olla que no es la tuya; la
--    recepción se decide en la transición de estado (siguiente policy).
--    `solicitud_items` cuelga de una solicitud visible por `solicitudes_select`.
create policy solicitudes_insert on public.solicitudes for insert to authenticated
  with check (olla_origen_id in (select app.mis_ollas())
              and app.mi_rol(olla_origen_id) in ('organizadora', 'admin'));

create policy solicitud_items_insert on public.solicitud_items for insert to authenticated
  with check (solicitud_id in (
    select s.id from public.solicitudes s
    where s.olla_origen_id in (select app.mis_ollas())
      and app.mi_rol(s.olla_origen_id) in ('organizadora', 'admin')
  ));

-- 4. solicitudes: UPDATE de SOLO `estado`. La policy no puede restringir
--    columnas (RLS es por fila), así que la frontera son los privilegios: se
--    retira el UPDATE de tabla a `authenticated` y se concede UPDATE solo de
--    `estado`. Un update de cualquier otra columna lanza 42501 aunque la fila
--    pase la policy. Las transiciones son
--    `borrador < enviada < aceptada < entregada` (`cancelada` terminal): las
--    valida la app (`packages/domain`); acá solo importa que nadie reescriba
--    origen, destino ni la marca de sync.
--
--    Quién transiciona: organizadora y admin, en las DOS ollas del pedido. La
--    organizadora de origen envía y cancela; la de destino acepta y entrega.
--    Si solo la de origen pudiera, el pedido nunca saldría de `enviada`; si
--    solo la de destino, no habría quien lo mande. `app.mi_rol` devuelve un
--    solo rol por olla: se comprueba olla por olla, no con un `in` mezclado.
revoke update on table public.solicitudes from authenticated;
grant update (estado) on table public.solicitudes to authenticated;

create policy solicitudes_update_estado on public.solicitudes for update to authenticated
  using (
    (olla_origen_id in (select app.mis_ollas())
     and app.mi_rol(olla_origen_id) in ('organizadora', 'admin'))
    or
    (olla_destino_id in (select app.mis_ollas())
     and app.mi_rol(olla_destino_id) in ('organizadora', 'admin'))
  )
  with check (
    (olla_origen_id in (select app.mis_ollas())
     and app.mi_rol(olla_origen_id) in ('organizadora', 'admin'))
    or
    (olla_destino_id in (select app.mis_ollas())
     and app.mi_rol(olla_destino_id) in ('organizadora', 'admin'))
  );

-- 5. Append-only en las cuatro tablas: se retira DELETE a `authenticated`. RLS
--    no basta (protege lo ajeno, no lo propio): con DELETE concedido, un
--    DELETE sobre filas de la propia olla no lanza, y la regla del repo es
--    que nada se borra desde el cliente (ARQUITECTURA.md §4.2, regla 5). En
--    `precios` y `servicios` la tabla no tenía ningún grant explícito en las
--    migraciones: el `grant all` de Supabase deja `authenticated` con UPDATE
--    y DELETE, y ese UPDATE rompería la inmutabilidad de la serie (D4). Se
--    revocan ambos y no se concede nada más.
--
--    TRUNCATE va también: es un DELETE encubierto y `authenticated` no lo
--    necesita (medido: `begin; set local role authenticated; truncate
--    public.precios;` pasaba antes de este revoke).
revoke update, delete, truncate on table public.precios from authenticated;
revoke update, delete, truncate on table public.servicios from authenticated;
revoke delete, truncate on table public.solicitudes from authenticated;
-- `solicitud_items` no tiene policy de UPDATE ni DELETE: sin el revoke, el
-- `grant all` de Supabase deja `authenticated` borrando ítems de sus propias
-- solicitudes y reescribiendo la cantidad.
revoke update, delete, truncate on table public.solicitud_items from authenticated;
