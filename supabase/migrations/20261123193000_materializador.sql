-- Materializador del outbox (#65, deuda D5).
--
-- `sync-push` inserta eventos en `evento_sync` y nada los aplicaba: quedaban
-- `pendiente` para siempre. Esta migracion trae el worker minimo en SQL, sin
-- proceso de fondo ni `service_role`:
--
--   * `app.aplicar_evento(event_uuid)` aplica UN evento y deja su estado final
--     (`aplicado` | `conflicto`). Es una transaccion por llamada: al terminar el
--     statement, `evento_sync` y la tabla destino cambian juntas o no cambian.
--   * `app.aplicar_pendientes(limite)` recorre los `pendiente` ordenados por
--     `(lamport, device_id)` y devuelve el resumen. Una Edge Function la expone.
--
-- Reglas (docs/adr/0009-materializador.md):
--   1. Allowlist entidad x rol: fuera de ella, `conflicto`, NO una excepcion. Un
--      evento que no se aplica por rol se registra; no tumba el lote.
--   2. Un error de constraint NO aborta el lote: se captura y se marca
--      `conflicto` con `sqlerrm` como motivo.
--   3. El payload viaja con las claves del contrato Zod
--      (`packages/contracts/src/domain.ts`): `codigoP`, `ollaId`, `insumoId`,
--      `delta`, `motivo`, `autor`, `at`, `canal`, `unidad`, `precio`, `fecha`,
--      `fuente`, `url`. `op` (`upsert`|`delete`) no viaja en `payload`: lo valida
--      `_shared/sync.ts` en el lote y no se guarda en la fila (la columna `op` de
--      `evento_sync` no existe). Se acepta `payload->>'op'` si algun cliente lo
--      mete, sin depender de el.
--   4. `security definer` + `search_path` explicito; la frontera de tenencia es
--      RLS sobre `evento_sync` (solo se ven los eventos de `app.mis_ollas()`).
--
-- Lo que esta migracion NO hace a proposito:
--   * `personas.op = 'delete'`: el borrado de personas es `deleted_at` con el
--     flujo de D2; `delete` se registra como `conflicto` en vez de inventar un
--     borrado fisico.
--   * `movimientos` no se edita ni se borra (append-only): un evento `delete` de
--     movimientos queda `conflicto`.
--   * `menus` y `raciones` no tienen destino en este modelo (la familia de menu
--     se arma por `menu_template`/`dish`/`portion`, no por un documento entero):
--     quedan `conflicto` "fuera de alcance" en vez de escribir a medias.

-- ---------------------------------------------------------------------------
-- app.aplicar_evento: aplica UN evento del outbox.
-- Devuelve el estado final del evento (`aplicado` | `conflicto`); nunca lanza por
-- un dato invalido del payload.
--
-- Por que NO hay un `begin ... exception` alrededor del bloque de aplicacion:
-- medido en la DB local (Postgres 15, `supabase db reset` + `pnpm db:test`), un
-- `exception` dentro de una funcion que corre bajo RLS cambia el rol del frame
-- de ejecucion: el INSERT dentro del bloque daba "new row violates row-level
-- security" (el rol efectivo pasaba de `postgres`, dueño de la tabla, al rol
-- `authenticated` del llamador). Consecuencia: personas/movimientos caian a
-- conflicto por un error de RLS que no se puede distinguir del CHECK. Solucion:
-- la decision (rol) se toma ANTES del caso y cada rama valida lo suyo a mano;
-- la unica captura queda en la red de seguridad del final, que corre con el
-- mismo rol que la llamada.
--
-- Decisiones de aplicacion como `postgres` (dueño): las tablas destino tienen
-- RLS y las escrituras legitimas desde `authenticated` no existen (movimientos,
-- precios, menu_template no tienen policy de insert; personas solo para
-- organizadora/admin). La frontera real es la allowlist + `evento_sync` visible.
-- ---------------------------------------------------------------------------
create or replace function app.aplicar_evento(p_event_uuid uuid)
returns text
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_evento   public.evento_sync%rowtype;
  v_payload  jsonb;
  v_rol      text;
  v_nuevo    text;
  v_actual   text;
  v_motivo   text;
  v_op       text;
begin
  -- Fila bloqueada: dos workers sobre el mismo evento se serializan, y el
  -- segundo ve `estado` ya cambiado y no-opera.
  select * into v_evento
  from public.evento_sync
  where event_uuid = p_event_uuid
  for update;

  if not found then
    return 'conflicto';  -- no hay evento: nada que aplicar (el caller no lo ve por RLS)
  end if;

  if v_evento.estado <> 'pendiente' then
    return v_evento.estado;  -- idempotente: aplicado/conflicto/enviado no se reevaluan
  end if;

  v_payload := coalesce(v_evento.payload, '{}'::jsonb);
  v_rol := app.mi_rol(v_evento.olla_id);
  v_op := coalesce(v_payload ->> 'op', 'upsert');

  -- 1. Allowlist entidad x rol. Fuera de la lista, conflicto registrado.
  if not (
    (v_evento.entidad = 'movimientos' and v_rol in ('cocinera', 'organizadora', 'admin'))
    or (v_evento.entidad = 'personas' and v_rol in ('organizadora', 'admin'))
    or (v_evento.entidad = 'solicitudes' and v_rol in ('organizadora', 'admin'))
    or (v_evento.entidad = 'precios' and v_rol in ('cocinera', 'admin'))
    or (v_evento.entidad = 'menus' and v_rol in ('nutricionista', 'admin'))
  ) then
    v_motivo := 'rol no autorizado para ' || v_evento.entidad;

  elsif v_evento.entidad = 'movimientos' then
    -- Append-only: solo alta. Un `delete` no se aplica.
    if v_op = 'delete' then
      v_motivo := 'movimientos es append-only: delete no se aplica';
    elsif exists (select 1 from public.movimientos m where m.id = (v_payload ->> 'id')::uuid) then
      -- La clave primaria es el id en el cliente (UUIDv7): re-aplicar el mismo
      -- evento no duplica; el id ya existente es el mismo movimiento.
      null;
    else
      insert into public.movimientos
        (id, olla_id, insumo_id, delta, motivo, autor, at, device_id, lamport)
      values (
        (v_payload ->> 'id')::uuid,
        v_evento.olla_id,
        v_payload ->> 'insumoId',
        (v_payload ->> 'delta')::numeric,
        v_payload ->> 'motivo',
        v_payload ->> 'autor',
        (v_payload ->> 'at')::timestamptz,
        v_evento.device_id,
        v_evento.lamport
      );
    end if;

  elsif v_evento.entidad = 'personas' then
    -- Upsert por `codigo_p`. Solo columnas del contrato; la tenencia es del
    -- evento (`olla_id`), no del payload (un payload con otra `ollaId` no
    -- puede mover la persona de olla: se ignora y manda el evento).
    if v_op = 'delete' then
      v_motivo := 'personas no se borra por sync: el borrado es deleted_at (D2)';
    elsif not coalesce((v_payload ->> 'codigoP') ~ '^P-[A-Z0-9]{4}$', false) then
      v_motivo := format('codigo P invalido: %s', coalesce(v_payload ->> 'codigoP', '(ausente)'));
    else
      insert into public.personas as p (
        codigo_p, olla_id, anio_nacimiento, sexo, categoria, anemia,
        peso_kg, talla_cm, consentimiento_seguimiento, notas,
        device_id, lamport
      )
      values (
        v_payload ->> 'codigoP',
        v_evento.olla_id,
        (v_payload ->> 'anioNacimiento')::integer,
        v_payload ->> 'sexo',
        v_payload ->> 'categoria',
        -- `->` y no `->>` en los opcionales: ausente queda NULL (sin dato), no
        -- el texto 'null' que rompe el CHECK de `anemia`.
        coalesce((v_payload -> 'anemia') #>> '{}', 'sin_dato'),
        (v_payload ->> 'pesoKg')::numeric,
        (v_payload ->> 'tallaCm')::numeric,
        coalesce((v_payload ->> 'consentimientoSeguimiento')::boolean, false),
        v_payload ->> 'notas',
        v_evento.device_id,
        v_evento.lamport
      )
      on conflict (codigo_p) do update set
        anio_nacimiento = excluded.anio_nacimiento,
        sexo = excluded.sexo,
        categoria = excluded.categoria,
        anemia = excluded.anemia,
        peso_kg = excluded.peso_kg,
        talla_cm = excluded.talla_cm,
        consentimiento_seguimiento = excluded.consentimiento_seguimiento,
        notas = excluded.notas,
        device_id = excluded.device_id,
        lamport = excluded.lamport,
        updated_at = now()
      -- Ultima escritura gana por (lamport, device_id): un evento viejo no
      -- pisa uno mas nuevo que ya llego.
      where (excluded.lamport, excluded.device_id) >= (p.lamport, p.device_id);
    end if;

  elsif v_evento.entidad = 'solicitudes' then
    -- Update de estado con la maquina de `packages/domain/src/solicitud.ts`:
    -- borrador -> enviada -> aceptada -> entregada, y
    -- borrador|enviada|aceptada -> cancelada. Ningun salto es valido.
    select s.estado into v_actual
    from public.solicitudes s
    where s.id = (v_payload ->> 'id')::uuid
    for update;

    if v_actual is null then
      v_motivo := 'solicitud no existe: ' || coalesce(v_payload ->> 'id', '(sin id)');
    else
      v_nuevo := v_payload ->> 'estado';
      if not (
        (v_actual = 'borrador' and v_nuevo = 'enviada')
        or (v_actual = 'enviada' and v_nuevo = 'aceptada')
        or (v_actual = 'aceptada' and v_nuevo = 'entregada')
        or (v_actual in ('borrador', 'enviada', 'aceptada') and v_nuevo = 'cancelada')
      ) then
        v_motivo := format('transicion invalida: %s -> %s', v_actual, coalesce(v_nuevo, '(sin estado)'));
      else
        update public.solicitudes
          set estado = v_nuevo,
              lamport = v_evento.lamport,
              device_id = v_evento.device_id
          where id = (v_payload ->> 'id')::uuid;
      end if;
    end if;

  elsif v_evento.entidad = 'precios' then
    -- Serie append-only: un precio nunca se reescribe, siempre se agrega.
    if v_op = 'delete' then
      v_motivo := 'precios es una serie append-only: delete no se aplica';
    else
      insert into public.precios
        (olla_id, insumo_id, canal, unidad, precio, fecha, fuente, url)
      values (
        v_evento.olla_id,
        v_payload ->> 'insumoId',
        v_payload ->> 'canal',
        v_payload ->> 'unidad',
        (v_payload ->> 'precio')::bigint,   -- microcentesimos por unidad base (ADR-0004)
        (v_payload ->> 'fecha')::date,
        v_payload ->> 'fuente',
        v_payload ->> 'url'
      );
    end if;

  else
    -- menus / raciones: sin destino materializable en este modelo.
    v_motivo := 'entidad fuera de alcance del materializador: ' || v_evento.entidad;
  end if;

  if v_motivo is not null then
    -- Una sola escritura: estado y motivo del conflicto. Dos updates sobre la
    -- misma fila sobrescribirian `payload` desde el valor previo.
    update public.evento_sync
      set estado = 'conflicto',
          payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{_conflicto}', to_jsonb(v_motivo))
      where event_uuid = p_event_uuid;
    return 'conflicto';
  end if;

  update public.evento_sync set estado = 'aplicado' where event_uuid = p_event_uuid;
  return 'aplicado';
exception
  when others then
    -- Red de seguridad (cast del payload, FK, CHECK no validado a mano): el
    -- statement aborta todo lo aplicado; se escribe el conflicto en una
    -- subtransaccion para que el lote siga. Si esa escritura tambien falla, el
    -- error se propaga y el evento queda `pendiente` para reintento.
    begin
      update public.evento_sync
        set estado = 'conflicto',
            payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{_conflicto}', to_jsonb(sqlerrm))
        where event_uuid = p_event_uuid;
    exception
      when others then
        raise;
    end;
    return 'conflicto';
end;
$$;

-- ---------------------------------------------------------------------------
-- app.aplicar_pendientes: recorre el outbox pendiente en orden contractual.
-- Devuelve {resumen: [...], aplicados, conflictos}.
-- ---------------------------------------------------------------------------
create or replace function app.aplicar_pendientes(p_limite integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_limite     integer := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_evento     record;
  v_estado     text;
  v_resumen    jsonb := '[]'::jsonb;
  v_aplicados  integer := 0;
  v_conflictos integer := 0;
begin
  -- El orden es `(lamport, device_id, event_uuid)`: los dos primeros son el
  -- contrato (`_shared/sync.ts`); el tercero desempata de forma determinista dos
  -- eventos del mismo reloj y dispositivo, que si no salen en orden arbitrario.
  -- `for update skip locked`: otro worker concurrente toma el resto sin esperar.
  for v_evento in
    select e.event_uuid, e.lamport, e.device_id, e.entidad
    from public.evento_sync e
    where e.estado = 'pendiente'
    order by e.lamport, e.device_id, e.event_uuid
    limit v_limite
    for update skip locked
  loop
    v_estado := app.aplicar_evento(v_evento.event_uuid);

    if v_estado = 'aplicado' then
      v_aplicados := v_aplicados + 1;
    elsif v_estado = 'conflicto' then
      v_conflictos := v_conflictos + 1;
    end if;

    v_resumen := v_resumen || jsonb_build_array(
      jsonb_build_object(
        'eventUuid', v_evento.event_uuid,
        'lamport', v_evento.lamport,
        'deviceId', v_evento.device_id,
        'entidad', v_evento.entidad,
        'estado', v_estado
      )
    );
  end loop;

  return jsonb_build_object(
    'resumen', v_resumen,
    'aplicados', v_aplicados,
    'conflictos', v_conflictos
  );
end;
$$;

-- Solo `authenticated` puede invocarlas (RLS sobre `evento_sync` decide que
-- eventos ve). Ningun rol anonimo ni el `postgres` de las migraciones las usa.
revoke all on function app.aplicar_evento(uuid) from public;
revoke all on function app.aplicar_pendientes(integer) from public;
-- El materializador expone funciones del esquema `app`: sin USAGE, la llamada
-- desde `authenticated` muere en "permission denied for schema app" (medido).
grant usage on schema app to authenticated;

grant execute on function app.aplicar_evento(uuid) to authenticated;
grant execute on function app.aplicar_pendientes(integer) to authenticated;
