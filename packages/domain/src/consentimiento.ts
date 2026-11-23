/**
 * Consentimiento del seguimiento y de las estadísticas (#74).
 *
 * La verdad es una tabla **append-only**: cada firma es una fila nueva y
 * revocar es otra fila con `otorgado = false`. Nunca hay UPDATE ni DELETE, así
 * que dos dispositivos sin red no se pisan: se ordenan por `lamport` (D5) y la
 * última firma gana.
 *
 * Dos permisos separados (informe Despensa Solidaria, Anexo A):
 *
 * - `seguimiento`: usar peso, talla y anemia de la persona para acompañarla.
 * - `estadisticas`: sumar sus datos, sin nombre, a los conteos por grupo.
 *
 * Negarse no quita el plato (D2). Este módulo no conoce red, Dexie ni React: el
 * reloj, el `id` del registro y el `deviceId` los inyecta quien llama, y acá
 * solo se decide qué dice el conjunto de firmas.
 */

export type TipoConsentimiento = 'seguimiento' | 'estadisticas';

/** Los dos permisos, en el orden en que la pantalla los muestra. */
export const TIPOS_CONSENTIMIENTO = ['seguimiento', 'estadisticas'] as const;

/**
 * `sin_registro` no es lo mismo que `revocado`: la primera vez nadie firmó
 * nada, y quien retiró un permiso dejó una fila que lo prueba. La UI lo dice
 * con palabras distintas porque son cosas distintas.
 */
export type EstadoConsentimiento = 'otorgado' | 'revocado' | 'sin_registro';

/** Versión del texto de consentimiento que se firmó. Sube con el texto. */
export const CONSENTIMIENTO_VERSION = 1;

/** Fila tal como viaja al servidor y como vive en Dexie (más `ollaId`). */
export interface RegistroConsentimiento {
  /** UUID generado en el dispositivo; la base no lo inventa (D5). */
  readonly id: string;
  /** `codigoP` del padrón: la persona nunca se identifica con un nombre (D2). */
  readonly personaId: string;
  readonly tipo: TipoConsentimiento;
  readonly otorgado: boolean;
  readonly version: number;
  /** ISO 8601 con zona explícita. */
  readonly firmadoEn: string;
  /** Solo en la fila de revocación; `null` en la de otorgamiento. */
  readonly revocadoEn: string | null;
  readonly deviceId: string;
  readonly lamport: number;
}

/** Lo que hay que inyectar para firmar: nada se lee del reloj del sistema. */
export interface DatosFirma {
  readonly id: string;
  readonly personaId: string;
  readonly tipo: TipoConsentimiento;
  readonly firmadoEn: string;
  readonly deviceId: string;
  readonly lamport: number;
  /** Por defecto, la versión vigente del texto. */
  readonly version?: number;
}

/**
 * Datos que no permiten construir una firma válida.
 *
 * No se "arregla" el dato: una firma con fecha sin zona o `lamport` negativo
 * no se guarda (un consentimiento con la fecha inventada es peor que ninguno).
 */
export class ConsentimientoInvalido extends Error {
  constructor(motivo: string) {
    super(`Consentimiento inválido: ${motivo}`);
    this.name = 'ConsentimientoInvalido';
  }
}

/** ISO 8601 con zona: `Z` o un desfase `±hh:mm`. */
const ISO_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function textoObligatorio(valor: string, campo: string): void {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new ConsentimientoInvalido(`falta ${campo}`);
  }
}

function enteroMinimo(valor: number, campo: string, minimo: number): void {
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new ConsentimientoInvalido(`${campo} debe ser un entero >= ${minimo}`);
  }
}

function validarFirma(datos: DatosFirma): void {
  textoObligatorio(datos.id, 'el id');
  textoObligatorio(datos.personaId, 'la persona');
  textoObligatorio(datos.deviceId, 'el dispositivo');
  if (!ISO_CON_ZONA.test(datos.firmadoEn)) {
    throw new ConsentimientoInvalido('la fecha de firma debe ser ISO 8601 con zona horaria');
  }
  enteroMinimo(datos.lamport, 'el lamport', 0);
  enteroMinimo(datos.version ?? CONSENTIMIENTO_VERSION, 'la versión', 1);
}

/** Otorga un permiso: fila nueva, vigente desde `firmadoEn`. */
export function otorgar(datos: DatosFirma): RegistroConsentimiento {
  validarFirma(datos);
  return {
    id: datos.id,
    personaId: datos.personaId,
    tipo: datos.tipo,
    otorgado: true,
    version: datos.version ?? CONSENTIMIENTO_VERSION,
    firmadoEn: datos.firmadoEn,
    revocadoEn: null,
    deviceId: datos.deviceId,
    lamport: datos.lamport,
  };
}

/**
 * Revoca un permiso: fila nueva, nunca un UPDATE de la anterior.
 *
 * No exige que exista un otorgamiento previo: si alguien dice "no" antes de
 * haber dicho "sí", esa negativa también queda registrada y `estadoConsentimiento`
 * la lee como `revocado`, no como "sin registro".
 */
export function revocar(datos: DatosFirma): RegistroConsentimiento {
  validarFirma(datos);
  return {
    id: datos.id,
    personaId: datos.personaId,
    tipo: datos.tipo,
    otorgado: false,
    version: datos.version ?? CONSENTIMIENTO_VERSION,
    firmadoEn: datos.firmadoEn,
    revocadoEn: datos.firmadoEn,
    deviceId: datos.deviceId,
    lamport: datos.lamport,
  };
}

/**
 * Orden contractual de las firmas: `lamport` ascendente, y para el mismo
 * `lamport` desempata `firmadoEn`, después `deviceId` y por último `id`, que es
 * único. Así el resultado no depende del orden en que llegaron las filas ni del
 * orden del arreglo.
 */
export function ordenarConsentimientos<T extends RegistroConsentimiento>(
  registros: readonly T[],
): readonly T[] {
  return [...registros].sort((a, b) => {
    if (a.lamport !== b.lamport) return a.lamport - b.lamport;
    if (a.firmadoEn !== b.firmadoEn) return a.firmadoEn < b.firmadoEn ? -1 : 1;
    if (a.deviceId !== b.deviceId) return a.deviceId < b.deviceId ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Última firma de ese permiso, o `null` si nadie firmó todavía.
 *
 * Filtrar por `tipo` acá es lo que mantiene separados los dos permisos: la
 * firma de estadísticas no dice nada del seguimiento.
 */
export function ultimoRegistro<T extends RegistroConsentimiento>(
  registros: readonly T[],
  tipo: TipoConsentimiento,
): T | null {
  const delTipo = ordenarConsentimientos(registros.filter((r) => r.tipo === tipo));
  return delTipo.length === 0 ? null : (delTipo[delTipo.length - 1] ?? null);
}

/** Estado visible del permiso: la última firma, no la primera. */
export function estadoConsentimiento(
  registros: readonly RegistroConsentimiento[],
  tipo: TipoConsentimiento,
): EstadoConsentimiento {
  const ultimo = ultimoRegistro(registros, tipo);
  if (ultimo === null) return 'sin_registro';
  return ultimo.otorgado && ultimo.revocadoEn === null ? 'otorgado' : 'revocado';
}

/**
 * ¿El permiso está vigente ahora?
 *
 * Es la pregunta que hace el agregado de salud: solo se cuenta a quien tiene
 * `seguimiento` vigente. Una revocación corta el conteo al instante.
 */
export function estaVigente(
  registros: readonly RegistroConsentimiento[],
  tipo: TipoConsentimiento,
): boolean {
  return estadoConsentimiento(registros, tipo) === 'otorgado';
}
