import type {
  Contexto,
  EstadoMenu,
  GrupoEtario,
  HallazgoMenu,
  MenuSemanal,
  PlatoMenu,
  Porcion,
  PorcionAjustada,
  Restriccion,
  ResultadoSustitucion,
  ResultadoValidacion,
  SustitucionAprobada,
  TextoExplicativo,
} from './contrato.js';
import { NoImplementado } from './errors.js';
import { validarReglas } from './reglas.js';

const ESTADOS_FIRMADOS: readonly EstadoMenu[] = ['aprobado', 'publicado'];

/**
 * Aporte del insumo a cada sello de la lista: se compara normalizado (trim,
 * minusculas, sin tildes, espacios colapsados) contra el insumoId y contra cada
 * palabra/segmento de la restriccion.
 *
 * Decision propia (#75): el catalogo de alergenos vive fuera de este paquete (cero
 * cifras, cero tablas aca). El sello de alergia es un texto que se compara contra el
 * `insumoId`; un sello que no aparece en NINGUN ingrediente del menu no puede
 * resolver una restriccion, y una restriccion de alergia sin sello resoluble es
 * ambiguo por definicion: se declara `firma` y `valido: false` en vez de suponer
 * que no cruza (`null` no es `0`).
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function sellosDe(valor: string): string[] {
  return normalizar(valor)
    .split(/[\s,;|/]+/)
    .filter((sello) => sello.length > 0);
}

function insumoCoincide(insumoId: string, sello: string): boolean {
  const insumo = normalizar(insumoId);
  return insumo === sello || insumo.includes(sello);
}

/** Contenido canonico que se firma: la misma serializacion que `packages/domain`. */
function serializarMenu(menu: MenuSemanal): string {
  const dias = menu.dias
    .flatMap((dia) =>
      dia.platos.map((plato) => {
        const porciones = plato.porciones
          .map((porcion) => `${porcion.grupo}:${porcion.cantidad}:${porcion.unidad}`)
          .sort()
          .join(',');
        return `${plato.id}|${plato.momento}|${plato.titulo}|${porciones}`;
      }),
    )
    .sort()
    .join(';');
  // Sin dia ni fecha: el formato firmado es el canonico de `packages/domain`
  // (`serializarContenido`, el que produce `menu_template.hash` en el seed).
  return `menu:${menu.id}|perfil:${menu.perfil}|opcion:${menu.opcion}|${dias}`;
}

/** SHA-256 hex (FIPS 180-4). Puro: sin `node:crypto` ni WebCrypto. */
function sha256Hex(texto: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
    0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
    0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
    0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
    0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ];
  const bytes = new TextEncoder().encode(texto);
  const largoBits = bytes.length * 8;
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const bloque = new Uint8Array(total);
  bloque.set(bytes);
  bloque[bytes.length] = 0x80;
  const vista = new DataView(bloque.buffer);
  vista.setUint32(total - 8, Math.floor(largoBits / 0x100000000), false);
  vista.setUint32(total - 4, largoBits >>> 0, false);

  const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = vista.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H as [
      number, number, number, number, number, number, number, number,
    ];
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const sumas = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) H[i] = (H[i]! + sumas[i]!) >>> 0;
  }

  return H.map((palabra) => palabra.toString(16).padStart(8, '0')).join('');
}

function esHash(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && /^[0-9a-f]{64}$/.test(texto);
}

/**
 * Valida un menu firmado contra sus restricciones (alergias, dietas, frecuencia,
 * inocuidad) y verifica el sello. No prescribe dietas ni calcula requerimientos.
 *
 * Un menu `aprobado`/`publicado` sin sello valido es invalido: devuelve
 * `selloValido: false` con el hallazgo `firma` por cada campo que falla.
 */
export function validarMenu(
  menu: MenuSemanal,
  restricciones: readonly Restriccion[],
  ctx: Contexto,
): ResultadoValidacion {
  validarReglas(ctx.reglas);

  const hallazgos: HallazgoMenu[] = [];
  const platos = menu.dias.flatMap((dia) => dia.platos);
  const hashCalculado = sha256Hex(serializarMenu(menu));
  const gruposObligatorios = ctx.reglas.gruposObligatorios;

  const hallazgoFirma = (campo: string, mensaje: string): void => {
    hallazgos.push({
      tipo: 'firma',
      severidad: 'critico',
      platoId: null,
      insumoId: null,
      mensaje: `${campo}: ${mensaje}`,
      tecnico: null,
    });
  };

  // 1. Estado y sello: sin sello no hay menu firmado.
  let selloValido = true;
  if (!ESTADOS_FIRMADOS.includes(menu.estado)) {
    selloValido = false;
    hallazgoFirma('estado', `el estado "${menu.estado}" no es aprobado ni publicado`);
  }
  const sello = menu.sello;
  if (sello === null) {
    selloValido = false;
    hallazgoFirma('sello', 'el menu no tiene sello del nutricionista');
  } else {
    if (sello.hash !== menu.hash) {
      selloValido = false;
      hallazgoFirma(
        'sello.hash',
        `el hash del sello no coincide con el hash del menu (${menu.hash.slice(0, 12)}...)`,
      );
    }
    if (!esHash(menu.hash)) {
      selloValido = false;
      hallazgoFirma('hash', 'el hash del menu no es un SHA-256 hex de 64 caracteres');
    } else if (hashCalculado !== menu.hash) {
      selloValido = false;
      hallazgoFirma('hash', 'el hash recalculado no corresponde al contenido del menu');
    }
    if (sello.version !== menu.version) {
      selloValido = false;
      hallazgoFirma(
        'sello.version',
        `sello v${sello.version} contra menu v${menu.version}`,
      );
    }
    if (sello.nutricionista.trim() === '' || sello.cnp.trim() === '') {
      selloValido = false;
      hallazgoFirma('sello', 'el sello no identifica nutricionista y CNP');
    }
    if (Number.isNaN(Date.parse(sello.fecha))) {
      selloValido = false;
      hallazgoFirma('sello.fecha', 'la fecha del sello no es una fecha ISO 8601 valida');
    }
  }

  // 2. Alergias: veto absoluto. Solo `alergia`; dieta/frecuencia/inocuidad son otro
  //    tipo de restriccion y no se evaluan aca (no convertir en veto lo que no lo es).
  const insumosDelMenu = new Set(
    platos.flatMap((plato) => plato.ingredientes.map((ing) => normalizar(ing.insumoId))),
  );
  for (const restriccion of restricciones) {
    if (restriccion.tipo !== 'alergia' || restriccion.valor.trim() === '') continue;
    const sellos = sellosDe(restriccion.valor);
    const resolubles = sellos.filter((sello) =>
      [...insumosDelMenu].some((insumo) => insumoCoincide(insumo, sello)),
    );
    if (resolubles.length === 0) {
      hallazgoFirma(
        'alergia',
        `la alergia "${restriccion.valor}" no cruza ningun insumo del menu: no se puede resolver`,
      );
      continue;
    }
    for (const plato of platos) {
      const cruzados = new Set(
        plato.ingredientes
          .map((ing) => ing.insumoId)
          .filter((insumoId) => resolubles.some((sello) => insumoCoincide(insumoId, sello))),
      );
      for (const insumoId of cruzados) {
        hallazgos.push({
          tipo: 'alergia',
          severidad: 'critico',
          platoId: plato.id,
          insumoId,
          mensaje: `el insumo "${insumoId}" cruza la alergia "${restriccion.valor}": veto`,
          tecnico: null,
        });
      }
    }
  }

  // 3. Cobertura de grupos obligatorios: faltante = hallazgo, nunca un 0.
  const platosSinPorcion: string[] = [];
  for (const plato of platos) {
    for (const grupo of gruposObligatorios) {
      const porcion = plato.porciones.find((p) => p.grupo === grupo);
      if (porcion === undefined) {
        hallazgos.push({
          tipo: 'porcion',
          severidad: 'alto',
          platoId: plato.id,
          insumoId: null,
          mensaje: `falta la porcion firmada del grupo "${grupo}"`,
          tecnico: null,
        });
        if (!platosSinPorcion.includes(plato.id)) platosSinPorcion.push(plato.id);
      }
    }
  }

  // 4. Composicion: ausente degrada (va a `insumosSinDato`), no rompe.
  const insumosSinDato: string[] = [];
  for (const plato of platos) {
    for (const ing of plato.ingredientes) {
      if (ing.gramos === null) continue;
      if (ctx.composicion.aporte(ing.insumoId, ing.gramos) === null) {
        if (!insumosSinDato.includes(ing.insumoId)) insumosSinDato.push(ing.insumoId);
      }
    }
  }

  const pares = platos.length * gruposObligatorios.length;
  const conPorcion = pares - platosSinPorcion.length * gruposObligatorios.length;
  const coberturaDatos = pares === 0 ? 1 : conPorcion / pares;
  const valido = selloValido && hallazgos.length === 0;

  const explicacion: TextoExplicativo = {
    titulo:
      hallazgos.length === 0
        ? 'Menu firmado y validado'
        : 'Menu con observaciones: no se sirve',
    lineas:
      hallazgos.length === 0
        ? [`El menu v${menu.version} cumple sello, alergias y cobertura de grupos.`]
        : hallazgos.map((h) => h.mensaje),
    accion: hallazgos.length === 0 ? null : 'Corregir y volver a firmar antes de publicar.',
    reconocimiento: null,
    derivacion: null,
    notaDatos:
      insumosSinDato.length === 0
        ? null
        : 'Hay insumos sin composicion conocida; el detalle tecnico los marca.',
    nivelTecnico: false,
  };

  return {
    menuId: menu.id,
    valido,
    selloValido,
    hashCalculado,
    hallazgos,
    coberturaDatos,
    platosSinPorcion,
    insumosSinDato,
    trazabilidad: {
      motorVersion: 'nutrition/menu@1',
      reglasVersion: ctx.reglas.version,
      composicionVersion: ctx.composicion.version,
      menuVersion: menu.version,
      calculadoEn: ctx.ahora,
    },
    explicacion,
  };
}

/**
 * Ajusta la porcion firmada para un grupo etario. El factor sale de las reglas;
 * nunca se inventa una equivalencia.
 *
 * TODO(M3): implementar. Sin reglas completas no se ajusta: `ContratoInvalido`.
 */
export function porcionParaGrupo(
  grupo: GrupoEtario,
  porcionBase: Porcion,
  ctx: Contexto,
): PorcionAjustada {
  validarReglas(ctx.reglas);
  void grupo;
  void porcionBase;
  throw new NoImplementado('porcionParaGrupo');
}

/**
 * Aplica una sustitucion APROBADA en la plantilla, con su factor.
 * Nada de equivalencias inventadas ni sustituciones fuera de la lista.
 *
 * TODO(M3): implementar. Si no esta aprobada, `ContratoInvalido`.
 */
export function sustituirInsumo(
  plato: PlatoMenu,
  insumoOrigenId: string,
  sustituciones: readonly SustitucionAprobada[],
  ctx: Contexto,
): ResultadoSustitucion {
  validarReglas(ctx.reglas);
  void plato;
  void insumoOrigenId;
  void sustituciones;
  throw new NoImplementado('sustituirInsumo');
}

/**
 * Redacta el resultado. `organizadora` no puede ver tecnicismos ni cifras clinicas.
 *
 * TODO(M3): implementar con plantillas versionadas; nunca inventar frases con cifras.
 */
export function explicar(
  resultado: ResultadoValidacion,
  audiencia: 'organizadora' | 'nutricionista',
  ctx: Contexto,
): TextoExplicativo {
  validarReglas(ctx.reglas);
  void resultado;
  void audiencia;
  throw new NoImplementado('explicar');
}
