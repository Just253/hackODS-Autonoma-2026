// GET /sync/pull?since=<lamport>&since_device=<device_id>
//
// Devuelve eventos con `(lamport, device_id) > (since, since_device)`, ordenados
// por esa misma clave. `since_device` es opcional; sin el, se pagina solo por lamport.
// Contrato: docs/contracts/sync.md. RLS aplica con el JWT del cliente.
//
// Deploy: supabase functions deploy sync-pull

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, preflight } from '../_shared/http.ts';
import { PULL_MAXIMO } from '../_shared/sync.ts';

const DEVICE_ID = /^[A-Za-z0-9_-]{1,64}$/;

interface FilaEvento {
  event_uuid: string;
  idempotency_key: string;
  lamport: number;
  device_id: string;
  olla_id: string;
  entidad: string;
  payload: unknown;
  estado: string;
  creado_en: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return preflight();
  }
  if (req.method !== 'GET') {
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

  const url = new URL(req.url);
  const sinceParam = url.searchParams.get('since') ?? '0';
  const since = Number(sinceParam);
  if (!Number.isInteger(since) || since < 0) {
    return json({ error: 'since debe ser un entero >= 0' }, 400);
  }

  const sinceDevice = url.searchParams.get('since_device');
  if (sinceDevice !== null && !DEVICE_ID.test(sinceDevice)) {
    return json({ error: 'since_device invalido' }, 400);
  }

  const limiteParam = Number(url.searchParams.get('limit') ?? PULL_MAXIMO);
  const limite =
    Number.isInteger(limiteParam) && limiteParam > 0
      ? Math.min(limiteParam, PULL_MAXIMO)
      : PULL_MAXIMO;

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // `v_evento_sync_pull` sanea el payload por rol (#4): a quien no es
  // nutricionista/admin le quita anemia/pesoKg/tallaCm/notas de las personas.
  // La frontera vive en el SQL (migración 20261123170000), no acá.
  let consulta = supabase
    .from('v_evento_sync_pull')
    .select(
      'event_uuid, idempotency_key, lamport, device_id, olla_id, entidad, payload, estado, creado_en',
    );

  if (sinceDevice === null) {
    consulta = consulta.gt('lamport', since);
  } else {
    consulta = consulta.or(
      `lamport.gt.${since},and(lamport.eq.${since},device_id.gt.${sinceDevice})`,
    );
  }

  const { data, error } = await consulta
    .order('lamport', { ascending: true })
    .order('device_id', { ascending: true })
    .limit(limite);

  if (error !== null) {
    return json({ error: error.message }, 400);
  }

  const filas = (data ?? []) as FilaEvento[];
  const ultima = filas.at(-1);

  return json({
    eventos: filas.map((fila) => ({
      eventUuid: fila.event_uuid,
      idempotencyKey: fila.idempotency_key,
      lamport: fila.lamport,
      deviceId: fila.device_id,
      ollaId: fila.olla_id,
      entidad: fila.entidad,
      payload: fila.payload,
      estado: fila.estado,
      creadoEn: fila.creado_en,
    })),
    cursor: {
      lamport: ultima?.lamport ?? since,
      deviceId: ultima?.device_id ?? (sinceDevice ?? ''),
    },
  });
});
