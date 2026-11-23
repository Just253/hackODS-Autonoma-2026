// POST /enroll — canjea (código de olla + PIN + deviceId) por una sesión.
//
// Contrato: docs/adr/0008-enrolamiento.md. Dos pasos y un dueño por paso:
//   1. SQL: `app.enroll(codigo, pin, deviceId)` valida el PIN con `crypt()` y escribe
//      `devices` + `olla_members` para el `sub` del JWT. Es `security definer` y NO
//      tiene EXECUTE para `authenticated`: la llama esta función con service_role.
//   2. Sesión: si el body no trae `accessToken`, esta función crea un usuario anónimo
//      con `auth.admin.createUser` y lo devuelve junto al refresh token. Con
//      `accessToken`, solo valida el JWT que le pasan (re-enrolar otro celular).
//
// `service_role` vive SOLO acá (server-side, pre-auth). El cliente nunca lo ve: el
// endpoint público es esta función, y `app.enroll` no es invocable con el anon key.
//
// Deploy: supabase functions deploy enroll   (no lo corre un agente)

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, preflight } from '../_shared/http.ts';

const CUERPO = {
  codigoOlla: 'string',
  pin: 'string',
  deviceId: 'string',
} as const;

/** Zod no está en el DENO_DIR del proyecto; tres campos se validan a mano sin dependencia. */
function leerCuerpo(cuerpo: unknown): { codigoOlla: string; pin: string; deviceId: string } | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  for (const campo of Object.keys(CUERPO)) {
    if (typeof c[campo] !== 'string' || (c[campo] as string).trim() === '') return null;
  }
  return {
    codigoOlla: (c.codigoOlla as string).trim(),
    pin: (c.pin as string).trim(),
    deviceId: (c.deviceId as string).trim(),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return preflight();
  }
  if (req.method !== 'POST') {
    return json({ error: 'metodo no permitido' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'funcion mal configurada' }, 500);
  }

  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return json({ error: 'JSON invalido' }, 400);
  }

  const entrada = leerCuerpo(crudo);
  if (entrada === null) {
    return json({ error: 'body: { codigoOlla, pin, deviceId }' }, 400);
  }

  // Sesión: la que trajo el cliente (Authorization: Bearer) o una anónima nueva.
  const authorization = req.headers.get('Authorization');
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let userId: string | null = null;
  let accessToken: string | null = null;
  let refreshToken: string | null = null;

  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length);
    const { data, error } = await service.auth.getUser(token);
    if (error !== null || data.user === null) {
      return json({ error: 'JWT invalido' }, 401);
    }
    userId = data.user.id;
    accessToken = token;
  } else {
    const email = `anon-${crypto.randomUUID()}@enrolamiento.local`;
    const password = crypto.randomUUID();
    const { data, error } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    if (error !== null || data.user === null) {
      return json({ error: 'no se pudo crear la sesion' }, 500);
    }
    userId = data.user.id;
    const sesion = await service.auth.signInWithPassword({ email, password });
    if (sesion.error === null) {
      accessToken = sesion.data.session?.access_token ?? null;
      refreshToken = sesion.data.session?.refresh_token ?? null;
    }
  }

  if (userId === null) {
    return json({ error: 'sin usuario' }, 500);
  }

  const { data: filas, error: errorRpc } = await service.rpc('enroll', {
    p_user_id: userId,
    p_codigo: entrada.codigoOlla,
    p_pin: entrada.pin,
    p_device_id: entrada.deviceId,
  });

  if (errorRpc !== null) {
    // 28P01 = PIN incorrecto; 22023 = código inexistente / body incompleto; resto 400.
    const status = errorRpc.code === '28P01' ? 401 : errorRpc.code === '22023' ? 422 : 400;
    return json({ error: status === 401 ? 'pin incorrecto' : 'no se pudo enrolar' }, status);
  }

  const primera = (filas ?? [])[0] as { out_olla_id?: string; out_rol?: string } | undefined;
  return json({
    ollaId: primera?.out_olla_id ?? null,
    rol: primera?.out_rol ?? null,
    userId,
    accessToken,
    refreshToken,
  });
});
