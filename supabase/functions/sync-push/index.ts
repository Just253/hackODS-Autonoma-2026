// POST /sync/push — recibe un lote del outbox y lo guarda de forma idempotente.
//
// Contrato: docs/contracts/sync.md.
// - Lote de 1..100 eventos.
// - `idempotency_key = event_uuid`: reenviar el mismo lote no duplica.
// - Orden contractual `(lamport, device_id)`.
// - RLS: el cliente usa su propio JWT; la funcion no usa `service_role`.
//
// Deploy: supabase functions deploy sync-push

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, preflight } from '../_shared/http.ts';
import { LOTE_MAXIMO, validarLote } from '../_shared/sync.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return preflight();
  }
  if (req.method !== 'POST') {
    return json({ error: 'metodo no permitido' }, 405);
  }

  const authorization = req.headers.get('Authorization');
  if (authorization === null || !authorization.startsWith('Bearer ')) {
    return json({ error: 'falta Authorization: Bearer <jwt>' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'funcion mal configurada' }, 500);
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: 'JSON invalido' }, 400);
  }

  const validacion = validarLote(cuerpo);
  if (!validacion.ok) {
    return json({ error: validacion.motivo, rechazados: validacion.rechazados }, 400);
  }

  if (validacion.eventos.length > LOTE_MAXIMO) {
    return json({ error: `lote mayor a ${LOTE_MAXIMO}` }, 400);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const filas = validacion.eventos.map((evento) => ({
    event_uuid: evento.eventUuid,
    idempotency_key: evento.idempotencyKey,
    lamport: evento.lamport,
    device_id: evento.deviceId,
    olla_id: evento.ollaId,
    entidad: evento.entidad,
    payload: evento.payload,
    estado: 'pendiente' as const,
    creado_en: evento.creadoEn,
  }));

  const { data, error } = await supabase
    .from('evento_sync')
    .upsert(filas, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    .select('idempotency_key');

  if (error !== null) {
    return json({ error: error.message }, 400);
  }

  const insertados = new Set(
    (data ?? []).map((fila: { idempotency_key: string }) => fila.idempotency_key),
  );

  const aceptados = validacion.eventos
    .filter((evento) => insertados.has(evento.idempotencyKey))
    .map((evento) => evento.idempotencyKey);

  const duplicados = validacion.eventos
    .filter((evento) => !insertados.has(evento.idempotencyKey))
    .map((evento) => evento.idempotencyKey);

  const { count } = await supabase
    .from('evento_sync')
    .select('event_uuid', { count: 'exact', head: true })
    .eq('estado', 'pendiente');

  return json({
    aceptados,
    duplicados,
    rechazados: [],
    pendientes: count ?? 0,
  });
});
