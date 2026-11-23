-- Máquina de estados de `solicitudes` en el servidor (#58, ADR-0007).
--
-- La 191000 abre el UPDATE de `estado` y comprueba el rol en las dos ollas del
-- pedido, pero no miraba el par `old.estado -> new.estado`: cualquier
-- organizadora de cualquiera de los dos lados podía escribir `entregada` desde
-- `borrador` o mover el pedido por el lado que no le toca. El dominio
-- (`packages/domain/src/solicitud.ts`, `ORIGENES_VALIDOS`) ya tiene la tabla; acá
-- se replica en el servidor para que la app no sea la única frontera.
--
--   origen (organizadora de `olla_origen_id`): borrador -> enviada;
--                                              borrador|enviada|aceptada -> cancelada
--   destino (organizadora de `olla_destino_id`): enviada -> aceptada;
--                                                aceptada -> entregada
--
-- `entregada` y `cancelada` son terminales. `admin` transiciona por cualquiera
-- de los dos lados.
--
-- El trato de la tabla: `cancelar` acepta los tres estados de partida en el
-- mismo lado (origen), así que se reconoce por el estado DESTINO (`cancelada`),
-- no por el par. Los tres pares restantes son exclusivos de un lado; no hay
-- ambigüedad de lado salvo que el usuario sea admin de las DOS ollas del
-- pedido. Ahí manda el par: `borrador->enviada` es de origen y
-- `enviada->aceptada`/`aceptada->entregada` son de destino; si el par no está en
-- la tabla, 42501 aunque sea admin de una de ellas. Es determinista y no abre
-- ninguna transición de más.
--
-- El trigger corre como invoker: quien evalúa el UPDATE es `authenticated`, y
-- ese rol no tenía USAGE en el esquema `app` (medido:
-- `has_schema_privilege('authenticated','app','usage')` daba false). Con la
-- función `security definer`, la llamada salía como `postgres` y el hueco no se
-- veía; desde acá se ve. El USAGE no abre tablas (sigue vigente la RLS y el
-- default-deny) ni funciones nuevas: `app` solo tiene `mis_ollas`, `mi_rol` y el
-- touch del reloj, todos `security definer` que filtran por `auth.uid()`. Sin
-- esto, cualquier UPDATE de `solicitudes` lanzaría 42501 "permission denied for
-- schema app" y la puerta que abrió la 191000 quedaría cerrada de facto.
grant usage on schema app to authenticated;

-- BEFORE UPDATE para lanzar antes de escribir. El orden entre triggers BEFORE
-- del mismo evento es alfabético (`estados_solicitud` < `solicitudes_touch`):
-- este corre primero y no ve `new.updated_at`. No importa: solo mira estados,
-- ollas y `app.mi_rol`.
--
-- Function SECURITY INVOKER (el default; no se declara `security definer`): la
-- llaman `authenticated` desde su UPDATE, así que `auth.uid()` es el del JWT y
-- `app.mi_rol` —que sí es security definer— resuelve el rol del usuario. El
-- `search_path` se fija igual que en el resto de funciones del repo.
create or replace function app.validar_transicion_solicitud()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lado text;
  v_rol_origen text;
  v_rol_destino text;
  v_rol_lado text;
begin
  -- Sin cambio de estado no hay transición que validar (el `solicitudes_touch`
  -- y cualquier UPDATE de estado idéntico siguen pasando).
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  -- Terminales: nada sale de `entregada` ni de `cancelada`.
  if old.estado in ('entregada', 'cancelada') then
    raise exception 'transicion invalida: % es terminal (pedido % intenta % -> %)',
      old.estado, old.id, old.estado, new.estado
      using errcode = '42501';
  end if;

  -- Lado del par. `cancelar` se reconoce por el estado destino; el resto de
  -- pares solo existen en un lado (ver comentario de cabecera).
  v_lado := case
    when old.estado = 'borrador' and new.estado = 'enviada'  then 'origen'
    when old.estado = 'enviada'  and new.estado = 'aceptada' then 'destino'
    when old.estado = 'aceptada' and new.estado = 'entregada' then 'destino'
    when new.estado = 'cancelada'
      and old.estado in ('borrador', 'enviada', 'aceptada') then 'origen'
    else null
  end;

  if v_lado is null then
    raise exception 'transicion invalida: % -> % no esta en la maquina de estados (pedido %)',
      old.estado, new.estado, old.id
      using errcode = '42501';
  end if;

  -- Quién: organizadora del lado que toca, o admin de CUALQUIERA de las dos
  -- ollas del pedido. `app.mi_rol` devuelve un rol por olla; si el usuario no
  -- tiene device en esa olla, devuelve null y el `in` no matchea.
  --
  -- Los dos roles se resuelven una sola vez y antes del `raise`: esta función
  -- es invoker y corre como `authenticated` (con USAGE en `app` desde arriba).
  v_rol_origen := app.mi_rol(old.olla_origen_id);
  v_rol_destino := app.mi_rol(old.olla_destino_id);

  if 'admin' in (v_rol_origen, v_rol_destino) then
    return new;
  end if;

  v_rol_lado := case v_lado
    when 'origen' then v_rol_origen
    else v_rol_destino
  end;

  if v_rol_lado is distinct from 'organizadora' then
    raise exception 'transicion invalida: % -> % es del lado % y el usuario no es organizadora de la olla de ese lado (pedido %)',
      old.estado, new.estado, v_lado, old.id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists solicitudes_estados on public.solicitudes;
create trigger solicitudes_estados
  before update on public.solicitudes
  for each row execute function app.validar_transicion_solicitud();
