-- Enrolamiento real (#62): `app.enroll()` + `pin_hash`/`recovery_hash` no legibles.
--
-- Medido antes del cambio (Podman, Postgres 15.20 + Supabase CLI 3.2.0):
--   * `public` tiene los `default privileges` del CLI con arwdDxt a anon/authenticated:
--     toda tabla nueva nace con SELECT de todas sus columnas, y `members_select` no mira
--     la columna. Con el JWT del propio miembro, `select pin_hash from members` devolvía
--     el hash. Eso es lo que cierra este archivo.
--   * Sin `USAGE` de `app` para `authenticated`: las funciones `app.*` se leen como el
--     `postgres` de la transacción (las policies las usan como dueño).
--
-- Alcance: `pin_hash`, `recovery_hash` e `id` de `members` dejan de ser legibles por
-- `anon`/`authenticated`. La policy `members_select` no cambia (sigue siendo la frontera
-- por fila). `devices.revoked_at` ya se respeta en `app.mis_ollas()`/`app.mi_rol()`
-- (20261123150000:332 y :345, `d.revoked_at is null`): no se toca el helper.
--
-- La sesión (JWT) la crea la Edge Function `enroll` con `auth.admin` (service_role, solo
-- server-side); este SQL solo valida el PIN y escribe `devices`/`olla_members`.

-- 1. `members`: se revoca el SELECT de tabla para los roles de la API y se re-otorga por
--    columna. `id` no se otorga: `member_id` ya viaja en `devices`, y así no se puede leer
--    el cursor de inserción. `insert/update/upsert` de PostgREST dependen del SELECT de
--    todas las columnas: se revocan también, `members` solo se escribe con service_role
--    (seed) o vía `app.enroll()` (security definer).
--
--    En este stack `authenticated` hereda de un rol de grupo propio (`authenticated`),
--    así que la tabla también se revoca en cascada; `postgres` re-otorga el privilegio
--    SOLO a la columna, que es lo que ve PostgREST con el JWT del cliente.
revoke select, insert, update on public.members from anon, authenticated cascade;
grant select (creado_en) on public.members to authenticated;

-- 2. `devices`: el cliente solo comprueba el estado del suyo, no escribe. `postgres`
--    mantiene sus privilegios (`app.enroll` es security definer suyo).
revoke select, insert, update on public.devices from anon, authenticated cascade;
grant select (user_id, member_id, enrolled_at, last_seen, revoked_at)
  on public.devices to authenticated;

-- 3. `app.mis_ollas()` y `app.mi_rol()` ya filtran `revoked_at`; sin cambios.

-- 4. Enrolamiento. Corre como `postgres` (security definer) y es el único camino que crea
--    `devices`/`olla_members` para un `auth.uid()` que todavía no tiene fila.
--
--    El dueño sale de `p_user_id` (lo pasa la Edge Function con el `sub` del JWT que
--    acaba de validar) y no de `auth.uid()`: con service_role el `request.jwt.claims`
--    de la sesión es el del servidor, no el del cliente. Un usuario sin `auth.users`
--    acá solo se ve en pgTAP (el runtime lo crea con `auth.admin`).
--
--    Un `auth.users` puede tener varias filas en `devices` (varias ollas en un celular),
--    así que `devices.member_id` sale de las filas que YA tienen ese `user_id`; un
--    `user_id` con dos `member_id` distintos es ambiguo y se rechaza (0A000).
create or replace function app.enroll(
  p_user_id uuid,
  p_codigo text,
  p_pin text,
  p_device_id text
)
-- Salidas `out_*`: `returns table (olla_id, rol)` chocaría con las columnas homónimas
-- de `olla_members` en el `insert ... on conflict`.
returns table (out_olla_id uuid, out_rol text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_user_id  uuid := p_user_id;
  v_olla_id  uuid;
  v_member   uuid;
  v_members  uuid[];
begin
  if v_user_id is null then
    raise exception 'enroll: falta el usuario (p_user_id)' using errcode = '22023';
  end if;

  if p_codigo is null or p_pin is null or p_device_id is null
     or btrim(p_device_id) = '' then
    raise exception 'enroll: codigo, pin y deviceId son obligatorios'
      using errcode = '22023';
  end if;

  select o.id into v_olla_id
  from public.ollas o
  where o.codigo = upper(btrim(p_codigo));
  if not found then
    raise exception 'enroll: codigo de olla inexistente' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct d.member_id), '{}'::uuid[])
    into v_members
  from public.devices d
  where d.user_id = v_user_id
    and d.revoked_at is null;

  -- `cardinality` y no `array_length`: en PG15 `array_length('{}'::uuid[], 1)` es NULL.
  if cardinality(v_members) > 1 then
    raise exception 'enroll: el usuario tiene varios miembros' using errcode = '0A000';
  elsif cardinality(v_members) = 0 then
    -- Primer enrolamiento: el PIN es la credencial de esa olla. Un PIN correcto de otra
    -- olla no enrola acá porque se compara solo contra los miembros de ESTA olla.
    select m.id into v_member
    from public.members m
    join public.olla_members om on om.member_id = m.id
    where om.olla_id = v_olla_id
      and crypt(p_pin, m.pin_hash) = m.pin_hash
    order by m.id
    limit 1;
  else
    -- Celular ya enrolado que suma otra olla: mismo PIN, ya sabemos quién es.
    v_member := v_members[1];
    if not exists (
      select 1 from public.members m
      where m.id = v_member and crypt(p_pin, m.pin_hash) = m.pin_hash
    ) then
      raise exception 'enroll: pin incorrecto' using errcode = '28P01';
    end if;
  end if;

  if v_member is null then
    -- Mismo errcode para "no existe" y "PIN mal": no se distingue desde afuera.
    raise exception 'enroll: pin incorrecto' using errcode = '28P01';
  end if;

  insert into public.devices (user_id, member_id, enrolled_at)
  values (v_user_id, v_member, now())
  on conflict (user_id) do update
    set member_id = excluded.member_id,
        revoked_at = null;

  insert into public.olla_members (member_id, olla_id, rol)
  select v_member, v_olla_id, 'cocinera'
  on conflict (member_id, olla_id) do nothing;

  return query
    select om.olla_id, om.rol
    from public.olla_members om
    where om.member_id = v_member and om.olla_id = v_olla_id;
end;
$$;

-- Por defecto EXECUTE es para PUBLIC: se revoca y se otorga `mis_ollas` solo al rol de
-- la API. `mi_rol` no se toca (nadie la invoca a mano; la usan las policies como dueño).
revoke execute on function app.mis_ollas() from public;
grant execute on function app.mis_ollas() to authenticated;

-- `enroll` lo llama la Edge Function con service_role. Con el rol `authenticated` sería
-- un oráculo de PINs para cualquier anónimo (30 req/h de frente, `auth.users` no se puede
-- crear desde la DB sin service_role). Sin EXECUTE para anon/authenticated: el cliente no
-- lo invoca.
revoke execute on function app.enroll(uuid, text, text, text) from public;

-- Las vistas de 20261123170000 nacieron con todos los privilegios de tabla; ya estaban
-- acotadas a SELECT por su propio `grant select`. Acá no se tocan (#4).
