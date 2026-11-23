// POST /sync/apply — materializa los eventos pendientes de las ollas del caller.
//
// Contrato: docs/contracts/sync.md §3 y docs/adr/0009-materializador.md.
// - Reemplaza el worker de fondo de M5 con una llamada bajo demanda.
// - Sin `service_role`: JWT del dispositivo; `app.aplicar_pendientes` es
//   `security definer` y su RLS sobre `evento_sync` limita a `app.mis_ollas()`.
// - El resumen dice, por evento, en que estado quedo (`aplicado` | `conflicto`).
//
// Deploy: supabase functions deploy sync-apply

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, preflight } from '../_shared/http.ts';

/** Mismo techo que `app.aplicar_pendientes` (el SQL ya recorta a 1..200). */
const LIMITE_MAXIMO = 200;
const LIMITE_DEFECTO = 50;

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

  // Cuerpo opcional: `{ "limite": 50 }`. Sin cuerpo, se usa el valor por defecto.
  let limite = LIMITE_DEFECTO;
  const crudo = await req.text();
  if (crudo.trim() !== '') {
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      return json({ error: 'JSON invalido' }, 400);
    }
    if (cuerpo !== null && typeof cuerpo === 'object' && 'limite' in cuerpo) {
      const pedido = (cuerpo as { limite: unknown }).limite;
      if (typeof pedido !== 'number' || !Number.isInteger(pedido) || pedido < 1) {
        return json({ error: 'limite debe ser un entero >= 1' }, 400);
      }
      limite = Math.min(pedido, LIMITE_MAXIMO);
    }
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('aplicar_pendientes', { p_limite: limite });

  if (error !== null) {
    return json({ error: error.message }, 400);
  }

  return json(data ?? { resumen: [], aplicados: 0, conflictos: 0 });
});
