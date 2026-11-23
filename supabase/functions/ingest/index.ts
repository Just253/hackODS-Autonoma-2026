// POST /ingest — captura (audio dictado o boleta) -> texto/items, embedding y categoria.
//
// Contrato: docs/contracts/ingesta.md. Decision: docs/adr/0011-ingesta.md.
//
// Reglas (supabase/AGENTS.md):
// - JWT de usuario obligatorio. **Sin `service_role`**: la insercion la hace
//   esta funcion con el cliente del usuario y la RLS de `captura`/`captura_item`.
// - El binario va a Storage `capturas/<olla_id>/<uuid>.<ext>`; la fila `captura`
//   guarda solo el `storage_path`. El bucket es privado (policy por prefijo).
// - Compute externo (tools/compute): UNA sola fachada stateless detras de
//   `$COMPUTE_URL` + `$COMPUTE_TOKEN` (Bearer, server-side). El token NUNCA
//   viaja al cliente. Si el compute no responde -> `502` con motivo, nunca mock.
// - Timeout de cada llamada a compute `~30 s`; la suma queda bien por debajo del
//   muro de la Edge Function.
//
// Env de la funcion (secrets de Supabase): COMPUTE_URL, COMPUTE_TOKEN.
// Deploy: supabase functions deploy ingest   (no lo corre un agente)

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, preflight } from '../_shared/http.ts';

const MAX_BYTES = 10 * 1024 * 1024;
const MS_COMPUTE = 30_000;
const BUCKET = 'capturas';

/**
 * Catalogo basico declarado. La base no tiene `producto_alias` hoy (verificado
 * en `supabase/migrations/`): la categoria por embedding usa estas etiquetas y
 * un umbral; bajo el umbral queda `sin_clasificar`. La funcion pura de
 * `packages/domain/src/ingesta.ts` es la misma idea; esta copia es la que
 * corre en Deno (no importa el paquete del monorepo).
 */
const UMBRAL = 0.69;
const CATALOGO_BASE: ReadonlyArray<{ categoria: string; alias: ReadonlyArray<string> }> = [
  { categoria: 'cereal', alias: ['arroz', 'trigo', 'maíz', 'avena', 'quinua'] },
  { categoria: 'legumbre', alias: ['frijol', 'lenteja', 'garbanzo', 'haba', 'pallar'] },
  { categoria: 'tubérculo', alias: ['papa', 'camote', 'yuca', 'olluco', 'oca'] },
  { categoria: 'verdura', alias: ['cebolla', 'tomate', 'zanahoria', 'zapallo', 'espinaca'] },
  { categoria: 'fruta', alias: ['plátano', 'manzana', 'naranja', 'papaya', 'piña'] },
  { categoria: 'carne', alias: ['pollo', 'res', 'cerdo', 'pavo'] },
  { categoria: 'pescado', alias: ['jurel', 'bonito', 'anchoveta', 'merluza'] },
  { categoria: 'lácteo', alias: ['leche', 'queso', 'yogur', 'mantequilla'] },
  { categoria: 'huevo', alias: ['huevo', 'huevos'] },
  { categoria: 'aceite', alias: ['aceite', 'manteca', 'grasa'] },
  { categoria: 'azúcar', alias: ['azúcar', 'panela', 'miel'] },
];

interface ErrorIngesta {
  readonly status: number;
  readonly codigo: string;
  readonly mensaje: string;
}

function error(status: number, codigo: string, mensaje: string): ErrorIngesta {
  return { status, codigo, mensaje };
}

function esErrorIngesta(e: unknown): e is ErrorIngesta {
  return typeof e === 'object' && e !== null && 'codigo' in e && 'status' in e;
}

/**
 * `COMPUTE_URL` sin barras finales. Configurada con `/` al final concatenaba
 * `//extract` y daba 404 en el smoke real (#98). Misma regla que
 * `packages/domain/src/ingesta.ts:normalizarBase` (la Edge no importa el monorepo).
 */
function normalizarBase(url: string): string {
  return url.replace(/\/+$/, '');
}

function extensionDe(mime: string, tipo: string): string {
  if (tipo === 'audio') {
    if (mime === 'audio/wav' || mime === 'audio/wave' || mime === 'audio/x-wav') return 'wav';
    return 'webm';
  }
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  return 'jpg';
}

function mimeValido(mime: string, tipo: string): boolean {
  return tipo === 'audio' ? mime.startsWith('audio/') : mime.startsWith('image/') || mime === 'application/pdf';
}

/** Coseno entre el vector de la imagen/texto y un alias del catalogo. */
function similitud(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let punto = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    punto += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  return na === 0 || nb === 0 ? 0 : punto / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Embeddings de los alias del catalogo; se piden una sola vez y se cachean. */
let cacheCatalogo: { cuando: number; entradas: ReadonlyArray<{ categoria: string; vector: number[] }> } = {
  cuando: 0,
  entradas: [],
};

async function embedTextos(textos: readonly string[], token: string, url: string): Promise<number[][]> {
  const respuesta = await fetch(`${url}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ textos }),
    signal: AbortSignal.timeout(MS_COMPUTE),
  });
  if (!respuesta.ok) {
    throw error(502, 'COMPUTE_EMBED', `Compute /embed respondio ${respuesta.status}.`);
  }
  const cuerpo = (await respuesta.json()) as { vectores?: number[][] };
  const vectores = cuerpo.vectores;
  if (!Array.isArray(vectores) || vectores.length !== textos.length) {
    throw error(502, 'COMPUTE_EMBED', 'Compute devolvio un numero de vectores distinto al pedido.');
  }
  return vectores;
}

async function catalogoConVectores(token: string, url: string): Promise<Array<{ categoria: string; vector: number[] }>> {
  if (Date.now() - cacheCatalogo.cuando < 10 * 60_000 && cacheCatalogo.entradas.length > 0) {
    return [...cacheCatalogo.entradas];
  }
  const textos = CATALOGO_BASE.map((c) => c.alias.join(', '));
  const vectores = await embedTextos(textos, token, url);
  const entradas = CATALOGO_BASE.map((c, i) => ({ categoria: c.categoria, vector: vectores[i] ?? [] }));
  cacheCatalogo = { cuando: Date.now(), entradas };
  return [...entradas];
}

function categorizar(vector: readonly number[], catalogo: ReadonlyArray<{ categoria: string; vector: number[] }>): {
  categoria: string;
  confianza: number;
} {
  let mejor: { categoria: string; confianza: number } = { categoria: 'sin_clasificar', confianza: 0 };
  for (const entrada of catalogo) {
    const s = similitud(vector, entrada.vector);
    if (s > mejor.confianza) mejor = { categoria: entrada.categoria, confianza: s };
  }
  return mejor.confianza >= UMBRAL ? mejor : { categoria: 'sin_clasificar', confianza: mejor.confianza };
}

interface ItemSalida {
  linea: number;
  textoCrudo: string;
  cantidad: number | null;
  unidad: string | null;
  precioUnitarioMicrocent: number | null;
}

interface ResultadoExtract {
  texto: string;
  items: ItemSalida[];
  estado: 'transcrita' | 'extraida';
}

function importeAMicrocent(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string' || texto.trim() === '') return null;
  const limpio = texto.trim().replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(limpio)) return null;
  const soles = Number(limpio.replace(',', '.'));
  return Number.isFinite(soles) && soles >= 0 ? Math.round(soles * 100_000_000) : null;
}

function cantidadNumero(texto: string | null | undefined): number | null {
  if (typeof texto !== 'string' || texto.trim() === '') return null;
  const n = Number(texto.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function transcribir(bytes: ArrayBuffer, mime: string, token: string, url: string): Promise<ResultadoExtract> {
  const respuesta = await fetch(`${url}/transcribe`, {
    method: 'POST',
    headers: { 'content-type': mime, authorization: `Bearer ${token}` },
    body: bytes,
    signal: AbortSignal.timeout(MS_COMPUTE),
  });
  if (!respuesta.ok) {
    throw error(502, 'COMPUTE_TRANSCRIBE', `Compute /transcribe respondio ${respuesta.status}.`);
  }
  const cuerpo = (await respuesta.json()) as { texto?: string };
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : '';
  return { texto, items: [], estado: 'transcrita' };
}

async function extraer(bytes: ArrayBuffer, mime: string, token: string, url: string): Promise<ResultadoExtract> {
  const respuesta = await fetch(`${url}/extract`, {
    method: 'POST',
    headers: { 'content-type': mime, authorization: `Bearer ${token}` },
    body: bytes,
    signal: AbortSignal.timeout(MS_COMPUTE),
  });
  if (!respuesta.ok) {
    throw error(502, 'COMPUTE_EXTRACT', `Compute /extract respondio ${respuesta.status}.`);
  }
  const cuerpo = (await respuesta.json()) as {
    items?: Array<{
      linea?: string | number;
      descripcion?: string | null;
      cantidadTexto?: string | null;
      unidadTexto?: string | null;
      precioUnitarioTexto?: string | null;
      totalLineaTexto?: string | null;
    }>;
  };
  const crudos = Array.isArray(cuerpo.items) ? cuerpo.items : [];
  const items: ItemSalida[] = crudos.map((c, i) => {
    const linea = typeof c.linea === 'number' ? c.linea : i + 1;
    const descripcion = typeof c.descripcion === 'string' ? c.descripcion : '';
    const cantidad = cantidadNumero(c.cantidadTexto);
    const unitario = importeAMicrocent(c.precioUnitarioTexto);
    const total = importeAMicrocent(c.totalLineaTexto);
    const precio = unitario ?? (total !== null && cantidad !== null && cantidad > 0 ? Math.round(total / cantidad) : null);
    const textoCrudo = [descripcion, c.cantidadTexto, c.unidadTexto, c.precioUnitarioTexto, c.totalLineaTexto]
      .filter((p): p is string => typeof p === 'string' && p !== '')
      .join(' ')
      .trim();
    return {
      linea,
      textoCrudo: textoCrudo || descripcion,
      cantidad,
      unidad: typeof c.unidadTexto === 'string' ? c.unidadTexto : null,
      precioUnitarioMicrocent: precio,
    };
  });
  const texto = items.map((it) => it.textoCrudo).join('\n');
  return { texto, items, estado: 'extraida' };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return json({ codigo: 'METODO_NO_PERMITIDO', mensaje: 'POST' }, 405);

  try {
    const authorization = req.headers.get('Authorization');
    if (authorization === null || !authorization.startsWith('Bearer ')) {
      throw error(401, 'SIN_JWT', 'falta Authorization: Bearer <jwt>');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const computeUrl = Deno.env.get('COMPUTE_URL');
    const computeToken = Deno.env.get('COMPUTE_TOKEN');
    if (!supabaseUrl || !anonKey || !computeUrl || !computeToken) {
      throw error(500, 'MAL_CONFIGURADA', 'faltan SUPABASE_URL, SUPABASE_ANON_KEY, COMPUTE_URL o COMPUTE_TOKEN');
    }
    const computeBase = normalizarBase(computeUrl);

    const form = await req.formData();
    const archivo = form.get('archivo');
    const tipo = form.get('tipo');
    if (!(archivo instanceof File)) throw error(400, 'SIN_ARCHIVO', 'falta `archivo` (multipart)');
    if (tipo !== 'audio' && tipo !== 'boleta') throw error(400, 'TIPO_INVALIDO', 'tipo debe ser audio|boleta');

    if (archivo.size > MAX_BYTES) throw error(413, 'ARCHIVO_GRANDE', `maximo ${MAX_BYTES} bytes`);
    const mime = (archivo.type || '').toLowerCase();
    if (!mimeValido(mime, tipo)) {
      throw error(415, 'MIME_NO_SOPORTADO', tipo === 'audio' ? 'se esperaba audio/*' : 'se esperaba image/png o image/jpeg');
    }
    // El compute (`/extract`) solo lee PNG/JPEG: el PDF se rechaza antes de subir
    // y de llamar compute (#98). Fallaría igual con 502, pero el motivo sería otro.
    if (tipo === 'boleta' && mime === 'application/pdf') {
      throw error(415, 'TIPO_NO_SOPORTADO', 'La boleta debe ser PNG o JPEG (el OCR no lee PDF)');
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // La olla se toma de la membresia del usuario; el cliente no la elige.
    // `ollas_select` (RLS) solo devuelve las ollas de `app.mis_ollas()`.
    const { data: ollas, error: ollaError } = await supabase
      .from('ollas')
      .select('id')
      .limit(1);
    if (ollaError !== null) throw error(500, 'OLLAS', ollaError.message);
    const primera = Array.isArray(ollas) ? ollas[0] : undefined;
    const ollaId = primera !== undefined && typeof (primera as { id?: unknown }).id === 'string'
      ? (primera as { id: string }).id
      : null;
    if (ollaId === null) throw error(403, 'SIN_OLLA', 'el usuario no pertenece a ninguna olla');

    const dispositivo = form.get('deviceId');
    const { data: usuario } = await supabase.auth.getUser();
    const deviceId = typeof dispositivo === 'string' && dispositivo.trim() !== ''
      ? dispositivo.trim()
      : usuario.user?.id ?? '';

    const extension = extensionDe(mime, tipo);
    const storagePath = `${ollaId}/${crypto.randomUUID()}.${extension}`;
    const bytesArreglo = await archivo.arrayBuffer();

    const { error: subidaError } = await supabase.storage.from(BUCKET).upload(storagePath, bytesArreglo, {
      contentType: mime,
      upsert: false,
    });
    if (subidaError !== null) throw error(subidaError.statusCode === '403' ? 403 : 502, 'STORAGE', subidaError.message);

    const resultado = tipo === 'audio'
      ? await transcribir(bytesArreglo, mime, computeToken, computeBase)
      : await extraer(bytesArreglo, mime, computeToken, computeBase);

    const texto = resultado.texto;
    let embedding: number[] | null = null;
    let categoria = 'sin_clasificar';
    let confianza = 0;
    try {
      const [vector] = await embedTextos([texto.trim() === '' ? 'captura vacia' : texto], computeToken, computeBase);
      embedding = vector ?? null;
      if (embedding !== null) {
        const catalogo = await catalogoConVectores(computeToken, computeBase);
        const categorizado = categorizar(embedding, catalogo);
        categoria = categorizado.categoria;
        confianza = Number(categorizado.confianza.toFixed(3));
      }
    } catch (e) {
      if (!esErrorIngesta(e)) throw e;
      // Sin embedding la captura sigue siendo util; el error queda en `error`.
      categoria = 'sin_clasificar';
    }

    const estado = categoria !== 'sin_clasificar' ? 'categorizada' : resultado.estado;

    const { data: fila, error: insertError } = await supabase
      .from('captura')
      .insert({
        olla_id: ollaId,
        device_id: deviceId,
        tipo,
        storage_path: storagePath,
        estado,
        texto,
        items: resultado.items,
        embedding: embedding === null ? null : `[${embedding.join(',')}]`,
        embedding_modelo: embedding === null ? null : 'bge-m3',
        categoria,
        confianza,
        error: null,
      })
      .select('id')
      .single();
    if (insertError !== null) throw error(400, 'INSERT_CAPTURA', insertError.message);
    const capturaId = (fila as { id: string }).id;

    if (resultado.items.length > 0) {
      const filas = resultado.items.map((it) => ({
        captura_id: capturaId,
        linea: it.linea,
        texto_crudo: it.textoCrudo,
        cantidad: it.cantidad,
        unidad: it.unidad,
        precio_unitario_microcent: it.precioUnitarioMicrocent,
        categoria: null,
        confianza: null,
      }));
      const { error: itemsError } = await supabase.from('captura_item').insert(filas);
      if (itemsError !== null) throw error(400, 'INSERT_ITEMS', itemsError.message);
    }

    return json({
      capturaId,
      estado,
      texto,
      categoria,
      confianza,
      items: resultado.items,
    });
  } catch (e) {
    if (esErrorIngesta(e)) return json({ codigo: e.codigo, mensaje: e.mensaje }, e.status);
    console.error('ingest: error interno', (e as Error)?.message);
    return json({ codigo: 'ERROR_INTERNO', mensaje: 'fallo la ingesta' }, 500);
  }
});
