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
// - Se acepta **solo** lo que el compute procesa (`supabase/functions/ingest/validacion.ts`):
//   png/jpeg para boleta, wav/webm para audio, con sus limites (4 MB / 8 MB) y
//   firma de bytes. Lo que el compute rechazaria se rechaza aca, antes de subir.
// - Si el compute o el insert fallan, el binario ya subido se borra: nada de
//   huerfanos en `capturas` (no hay policy de DELETE, el usuario no los limpia).
// - Timeouts por endpoint (Ms_EXTRACT/MS_TRANSCRIBE, con margen sobre el compute):
//   timeout propio -> `504`, distinto de "compute caido" (`502`).
// - Mensajes fijos al cliente; el detalle de PostgREST/Storage queda en el log.
//
// Env de la funcion (secrets de Supabase): COMPUTE_URL, COMPUTE_TOKEN.
// Deploy: supabase functions deploy ingest   (no lo corre un agente)

import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, preflight } from '../_shared/http.ts';
// Sin extension: `supabase functions deploy` rechaza imports con `.ts` explicito.
import {
  MS_EMBED,
  MS_EXTRACT,
  MS_MURO_EDGE,
  MS_TRANSCRIBE,
  bytesCoinciden,
  elegirOlla,
  extensionDe,
  limiteDe,
  mimeValido,
  normalizarMime,
  textoLimite,
} from './validacion';

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
 * `fetch` al compute con timeout propio. El timeout se distingue del compute caido:
 * uno es `504 COMPUTE_TIMEOUT` (el compute sigue trabajando, se puede reintentar) y el
 * otro `502` (no respondio). Antes todo era 30 s y un OCR en frio abortaba siempre.
 */
async function pedirCompute(url: string, init: RequestInit, ms: number, codigo: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    const nombre = (e as Error)?.name ?? '';
    if (nombre === 'TimeoutError' || nombre === 'AbortError') {
      throw error(504, 'COMPUTE_TIMEOUT', `el compute no respondio en ${Math.round(ms / 1000)} s; reintentá más tarde`);
    }
    console.error(`ingest: ${codigo} sin respuesta`, nombre);
    throw error(502, codigo, 'no se pudo hablar con el compute');
  }
}

/** Detalle para el log; al cliente nunca le llega el mensaje crudo de la base. */
function logDetalle(etapa: string, detalle: unknown): void {
  const partes = typeof detalle === 'object' && detalle !== null
    ? Object.entries(detalle as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null)
    : [];
  console.error(`ingest: ${etapa}`, partes.length > 0 ? partes.map(([k, v]) => `${k}=${String(v)}`).join(' ') : String(detalle));
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
  const respuesta = await pedirCompute(
    `${url}/embed`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ textos }),
    },
    MS_EMBED,
    'COMPUTE_EMBED',
  );
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
  const respuesta = await pedirCompute(
    `${url}/transcribe`,
    { method: 'POST', headers: { 'content-type': mime, authorization: `Bearer ${token}` }, body: bytes },
    MS_TRANSCRIBE,
    'COMPUTE_TRANSCRIBE',
  );
  if (!respuesta.ok) {
    throw error(502, 'COMPUTE_TRANSCRIBE', `Compute /transcribe respondio ${respuesta.status}.`);
  }
  const cuerpo = (await respuesta.json()) as { texto?: string };
  const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : '';
  return { texto, items: [], estado: 'transcrita' };
}

async function extraer(bytes: ArrayBuffer, mime: string, token: string, url: string): Promise<ResultadoExtract> {
  const respuesta = await pedirCompute(
    `${url}/extract`,
    { method: 'POST', headers: { 'content-type': mime, authorization: `Bearer ${token}` }, body: bytes },
    MS_EXTRACT,
    'COMPUTE_EXTRACT',
  );
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

  const inicio = Date.now();
  /**
   * `504` honesto si la suma de esperas pasa el muro de la Edge Function. Es perezoso a
   * proposito: si el request termino antes, el `setTimeout` se cancela y no se cierra;
   * solo corta los que ya no pueden devolver respuesta.
   */
  let avisarMuro: (() => void) | undefined;
  const muro = new Promise<never>((_, rechazar) => {
    avisarMuro = () =>
      rechazar(error(504, 'TIEMPO_AGOTADO', `la ingesta supero los ${Math.round(MS_MURO_EDGE / 1000)} s; reintenta`));
  });
  const temporizador = setTimeout(() => avisarMuro?.(), MS_MURO_EDGE);

  try {
    const authorization = req.headers.get('Authorization');
    if (authorization === null || !authorization.startsWith('Bearer ')) {
      // El contrato (docs/contracts/ingesta.md) fija 400 para `SIN_JWT`.
      throw error(400, 'SIN_JWT', 'falta Authorization: Bearer <jwt>');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const computeUrl = Deno.env.get('COMPUTE_URL');
    const computeToken = Deno.env.get('COMPUTE_TOKEN');
    if (!supabaseUrl || !anonKey || !computeUrl || !computeToken) {
      throw error(500, 'MAL_CONFIGURADA', 'faltan SUPABASE_URL, SUPABASE_ANON_KEY, COMPUTE_URL o COMPUTE_TOKEN');
    }

    const form = await req.formData();
    const archivo = form.get('archivo');
    const tipo = form.get('tipo');
    if (!(archivo instanceof File)) throw error(400, 'SIN_ARCHIVO', 'falta `archivo` (multipart)');
    if (tipo !== 'audio' && tipo !== 'boleta') throw error(400, 'TIPO_INVALIDO', 'tipo debe ser audio|boleta');

    // Solo lo que el compute procesa y con su limite real. El mensaje dice el tope.
    const mime = (archivo.type || '').toLowerCase();
    if (!mimeValido(mime, tipo)) {
      const esperado = tipo === 'audio' ? 'audio/wav o audio/webm' : 'una foto image/png o image/jpeg';
      throw error(415, 'MIME_NO_SOPORTADO', `se esperaba ${esperado}; llego "${archivo.type || 'sin tipo'}"`);
    }
    const mimeCanonico = normalizarMime(mime) ?? mime;
    const limite = limiteDe(tipo);
    if (archivo.size === 0) {
      throw error(400, 'ARCHIVO_VACIO', tipo === 'audio' ? 'el audio esta vacio' : 'la imagen esta vacia');
    }
    if (archivo.size > limite) {
      const mensaje = tipo === 'audio'
        ? `el audio supera los ${textoLimite(tipo)}; grabalo mas corto`
        : `la foto supera los ${textoLimite(tipo)}; sacala mas chica`;
      throw error(413, 'ARCHIVO_GRANDE', mensaje);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // `ollas_select` (RLS) solo devuelve las ollas de `app.mis_ollas()`; nunca `limit(1)`.
    const { data: ollas, error: ollaError } = await supabase.from('ollas').select('id');
    if (ollaError !== null) {
      logDetalle('OLLAS', ollaError);
      throw error(500, 'OLLAS', 'no se pudieron leer las ollas del usuario');
    }
    const misOllas = (Array.isArray(ollas) ? ollas : [])
      .map((o) => (typeof (o as { id?: unknown }).id === 'string' ? (o as { id: string }).id : ''))
      .filter((id) => id !== '');
    const pedida = form.get('olla_id');
    const eleccion = elegirOlla(typeof pedida === 'string' && pedida.trim() !== '' ? pedida : null, misOllas);
    if (!eleccion.ok) throw error(eleccion.status, eleccion.codigo, eleccion.mensaje);
    const ollaId = eleccion.ollaId;

    const dispositivo = form.get('deviceId');
    const { data: usuario } = await supabase.auth.getUser();
    const deviceId = typeof dispositivo === 'string' && dispositivo.trim() !== ''
      ? dispositivo.trim()
      : usuario.user?.id ?? '';

    const bytesArreglo = await archivo.arrayBuffer();
    // MIME mentiroso (p. ej. `image/png` con bytes de ZIP): rechazo antes de subir.
    if (!bytesCoinciden(new Uint8Array(bytesArreglo), mimeCanonico)) {
      throw error(415, 'MIME_NO_SOPORTADO', `el contenido no es ${mimeCanonico}; el archivo no coincide con su tipo`);
    }

    const storagePath = `${ollaId}/${crypto.randomUUID()}.${extensionDe(mimeCanonico)}`;

    /**
     * Deja el bucket como estaba si el compute o el insert fallan. El `catch` propio
     * no tapa el error original: si el remove falla, se loguea y se sigue devolviendo
     * el error del compute.
     */
    const borrarBinario = async (): Promise<void> => {
      try {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath]);
        if (removeError !== null) logDetalle('REMOVE_HUERFANO', removeError);
      } catch (e) {
        console.error('ingest: remove del binario fallo', (e as Error)?.message);
      }
    };

    /**
     * La subida y el trabajo de compute corren juntos con el muro: si el muro gana,
     * se borra lo que se haya subido. `enMarcha` es el error que hay que devolver si
     * el muro dispara antes de que la subida sepa su resultado.
     */
    const subida = (async (): Promise<unknown> => {
      const { error: subidaError } = await supabase.storage.from(BUCKET).upload(storagePath, bytesArreglo, {
        contentType: mimeCanonico,
        upsert: false,
      });
      return subidaError;
    })();
    let enMarcha: unknown = error(504, 'TIEMPO_AGOTADO', 'la subida no termino a tiempo; reintenta');
    const procesar = (async (): Promise<ResultadoExtract> => {
      try {
        const subidaError = await subida;
        if (subidaError !== null) {
          logDetalle('STORAGE', subidaError);
          const status = (subidaError as { statusCode?: string }).statusCode;
          throw error(status === '403' ? 403 : 502, 'STORAGE', 'no se pudo guardar el archivo');
        }
        return tipo === 'audio'
          ? await transcribir(bytesArreglo, mimeCanonico, computeToken, computeUrl)
          : await extraer(bytesArreglo, mimeCanonico, computeToken, computeUrl);
      } catch (e) {
        enMarcha = e;
        throw e;
      }
    })();

    let resultado: ResultadoExtract;
    try {
      resultado = await Promise.race([procesar, muro]);
    } catch (e) {
      // Si gano el muro, se devuelve el error real de la etapa en curso, no el generico.
      const original = esErrorIngesta(e) && e.codigo === 'TIEMPO_AGOTADO' ? enMarcha : e;
      await borrarBinario();
      throw original;
    }
    clearTimeout(temporizador);

    const texto = resultado.texto;
    let embedding: number[] | null = null;
    let categoria = 'sin_clasificar';
    let confianza = 0;
    try {
      const [vector] = await embedTextos([texto.trim() === '' ? 'captura vacia' : texto], computeToken, computeUrl);
      embedding = vector ?? null;
      if (embedding !== null) {
        const catalogo = await catalogoConVectores(computeToken, computeUrl);
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
    if (insertError !== null) {
      logDetalle('INSERT_CAPTURA', insertError);
      // La fila no existe: el binario no tiene quien lo referencie.
      await borrarBinario();
      throw error(400, 'INSERT_CAPTURA', 'no se pudo registrar la captura');
    }
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
      if (itemsError !== null) {
        logDetalle('INSERT_ITEMS', itemsError);
        await borrarBinario();
        throw error(400, 'INSERT_ITEMS', 'no se pudieron registrar las lineas de la captura');
      }
    }

    clearTimeout(temporizador);
    return json({
      capturaId,
      estado,
      texto,
      categoria,
      confianza,
      items: resultado.items,
    });
  } catch (e) {
    clearTimeout(temporizador);
    if (esErrorIngesta(e)) return json({ codigo: e.codigo, mensaje: e.mensaje }, e.status);
    // Nunca el stack ni la URL del compute al cliente: solo el tipo al log, con ms.
    console.error(`ingest: error interno (${Date.now() - inicio} ms)`, (e as Error)?.name ?? 'Error');
    return json({ codigo: 'ERROR_INTERNO', mensaje: 'fallo la ingesta' }, 500);
  }
});
