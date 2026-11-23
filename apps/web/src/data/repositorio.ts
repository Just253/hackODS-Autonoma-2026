import Dexie from 'dexie';

import {
  identidadLocalSchema,
  MENU_VERSION,
  nutrienteIdSchema,
  personaSchema,
  racionSchema,
  type Categoria,
  type IdentidadLocal,
  type NutrienteId,
  type Persona,
  type Racion,
  type Sexo,
} from '@hackods/contracts';

import { baseDeOlla } from './base.js';
import { generarCodigoPLibre, type Azar } from './codigos.js';
import { siguienteLamport } from './lamport.js';
import { outboxDe } from './outbox-repo.js';
import type { NuevoEvento } from '@hackods/sync';
import { estaVigente } from '@hackods/domain';

/**
 * Repositorio local del padron y del servicio.
 *
 * Todo lo que escribe pasa por aca y nada sale a la red: la pantalla no conoce
 * IndexedDB ni `fetch`, solo estas funciones (apps/web/AGENTS.md §1 y §2).
 * Los objetos se validan con los schemas de `@hackods/contracts` antes de
 * entrar a Dexie: un dato invalido no se guarda "para arreglarlo despues".
 */

export const OLLA_DEMO = 'olla-demo-01' as const;
export const DEVICE_DEMO = 'dispositivo-demo-01' as const;

/**
 * Cobertura cuando el calculo de `packages/nutrition` todavia no esta
 * conectado (DEC-2026-0003): cero de cada nutriente significa "sin calculo",
 * no "cero nutrientes". El contrato exige la clave de cada nutriente, asi que
 * omitirla no es opcion; dibujar el 0 seria mentir.
 *
 * Las claves salen de `nutrienteIdSchema.options`, no de una lista copiada:
 * agregar un nutriente al contrato no puede romper en runtime con un
 * `cobertura` incompleto.
 */
const COBERTURA_SIN_CALCULO: Record<NutrienteId, number> = Object.fromEntries(
  nutrienteIdSchema.options.map((id) => [id, 0]),
) as Record<NutrienteId, number>;

/**
 * Estado del consentimiento de seguimiento en el alta (#74).
 *
 * Antes el alta escribía `consentimientoSeguimiento: false` a mano, como si el
 * booleano fuera la verdad. Ya no: la verdad es la tabla `consentimiento`
 * (append-only) y este booleano del contrato se **deriva** de ella. En el alta
 * todavía no hay ninguna firma, y `estaVigente([], 'seguimiento')` es `false`:
 * "sin registro", no un "no" que alguien haya dado. La pantalla de
 * `features/consentimiento` es la que agrega la firma.
 */
const SIN_CONSENTIMIENTO_AL_ALTA = estaVigente([], 'seguimiento');

/**
 * Reloj y azar inyectables: el test no depende de la hora ni del azar reales.
 *
 * `idEvento` es el `eventUuid` del outbox. Se inyecta para que dos corridas del
 * mismo caso encolen el mismo id y la idempotencia se pueda probar de verdad.
 */
export interface Reloj {
  readonly ahora: () => string;
  readonly azar: Azar;
  readonly idEvento?: () => string;
}

const relojGlobal: Reloj = {
  ahora: () => new Date().toISOString(),
  azar: () => Math.random(),
  idEvento: () => crypto.randomUUID(),
};

/** `eventUuid` = `idempotencyKey` (contrato de `@hackods/sync`). */
export function idDeEvento(reloj: Reloj): string {
  return (reloj.idEvento ?? (() => crypto.randomUUID()))();
}

export interface AltaPersona {
  readonly anioNacimiento: number;
  readonly sexo: Sexo;
  readonly categoria: Categoria;
  /** Solo Dexie `localOnly`: no viaja, no se muestra en listas con P-XXXX. */
  readonly nombreLocal: string | null;
  readonly alias: string | null;
}

export interface PersonaConIdentidad {
  readonly persona: Persona;
  readonly identidad: IdentidadLocal;
}

export async function listarPersonas(ollaId: string = OLLA_DEMO): Promise<readonly Persona[]> {
  return baseDeOlla(ollaId).personas.orderBy('codigoP').toArray();
}

export async function contarPersonas(ollaId: string = OLLA_DEMO): Promise<number> {
  return baseDeOlla(ollaId).personas.count();
}

/**
 * Alta de una persona.
 *
 * Con 4 caracteres hay 32^4 codigos: la probabilidad de carrera es baja pero no
 * nula, asi que el alta es una transaccion que revalida el codigo recien creado
 * y reintenta. Un alta duplicada silenciosa seria peor que un error visible.
 */
export async function altaPersona(
  datos: AltaPersona,
  reloj: Reloj = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<PersonaConIdentidad> {
  const base = baseDeOlla(ollaId);
  const ahora = reloj.ahora();
  /** El evento que la transaccion deja en disco, si llega a confirmarse. */
  let confirmado: NuevoEvento | null = null;

  const resultado = await base.transaction('rw', base.personas, base.identidadLocal, base.meta, base.outbox, async () => {
    const ocupados = new Set((await base.personas.toCollection().primaryKeys()) as string[]);
    const codigoP = generarCodigoPLibre(ocupados, reloj.azar);
    const lamport = await siguienteLamport(base);
    const lamportEvento = await siguienteLamport(base);

    const persona = personaSchema.parse({
      codigoP,
      ollaId,
      anioNacimiento: datos.anioNacimiento,
      sexo: datos.sexo,
      categoria: datos.categoria,
      anemia: 'sin_dato',
      pesoKg: null,
      tallaCm: null,
      consentimientoSeguimiento: SIN_CONSENTIMIENTO_AL_ALTA,
      notas: null,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
      deviceId: DEVICE_DEMO,
      lamport,
    });

    const identidad = identidadLocalSchema.parse({
      localOnly: true,
      codigoP,
      nombreLocal: datos.nombreLocal,
      alias: datos.alias,
      actualizadoEn: ahora,
    });

    await base.personas.add(persona);
    // La identidad local (nombreLocal/alias) NO entra al evento: DEC-2026-0002.
    await base.identidadLocal.add(identidad);

    // Mismo transactional scope que el alta: si el agregado falla, no queda ni
    // persona ni evento (nunca "persona sin cambio pendiente").
    const eventUuid = idDeEvento(reloj);
    const evento: NuevoEvento = {
      eventUuid,
      idempotencyKey: eventUuid,
      lamport: lamportEvento,
      deviceId: DEVICE_DEMO,
      ollaId,
      entidad: 'personas',
      op: 'upsert',
      // Solo lo sincronizable: la persona ya validada por Zod, sin identidad.
      payload: persona,
      creadoEn: persona.updatedAt,
    };
    await outboxDe(base).encolarEnTransaccion(evento, base.outbox);
    confirmado = evento;

    return { persona, identidad };
  });

  // La transaccion ya confirmo: recien ahora el evento es un pendiente que el
  // badge puede contar. Si hubiera abortado, no se llega aca.
  if (confirmado !== null) outboxDe(base).registrarConfirmado(confirmado);

  return resultado;
}

/** La identidad local nunca se mezcla con `Persona`: misma base, otra tabla. */
export async function identidadDe(
  codigoP: string,
  ollaId: string = OLLA_DEMO,
): Promise<IdentidadLocal | undefined> {
  return baseDeOlla(ollaId).identidadLocal.get(codigoP);
}

export interface NuevaRacion {
  readonly personaCodigoP: string;
  /**
   * Servicio (menu del dia) al que pertenece la racion. Sin menu firmado
   * cargado se omite y toma el servicio del dia; nunca se guarda `null`, porque
   * `[personaCodigoP+servicioId]` es la clave y en IndexedDB `null` no puede
   * formar parte de una clave compuesta.
   */
  readonly servicioId?: string | null;
  readonly razones: readonly string[];
}

/** Identificador del servicio de hoy: `servicio-AAAA-MM-DD`. */
export function servicioDelDia(reloj: Reloj = relojGlobal): string {
  return `servicio-${reloj.ahora().slice(0, 10)}`;
}

/**
 * La racion ya existia para esa persona y servicio.
 *
 * Es un error visible, no un reemplazo silencioso: `raciones` es append-only
 * (contrato) y una racion se anula con otro registro, no editando la anterior.
 */
export class RacionDuplicada extends Error {
  readonly codigoP: string;
  readonly servicioId: string;

  constructor(codigoP: string, servicioId: string) {
    super(
      `Ya hay una ración registrada para ${codigoP} en el servicio ${servicioId}. ` +
        'Las raciones no se editan: se anulan con otro registro.',
    );
    this.name = 'RacionDuplicada';
    this.codigoP = codigoP;
    this.servicioId = servicioId;
  }
}

/**
 * Racion servida. Append-only: `add` con clave `[personaCodigoP+servicioId]`;
 * si ya existe una racion de esa persona en ese servicio falla con
 * `RacionDuplicada` en vez de pisarla.
 *
 * `componentes` y `cobertura` quedan vacios a proposito: el calculo por grupo
 * es de `packages/nutrition` (fuera de este write-set) y un cero dibujado como
 * dato seria peor que `sin dato`.
 */
export async function guardarRacion(
  datos: NuevaRacion,
  reloj: Reloj = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<Racion> {
  const base = baseDeOlla(ollaId);
  const servicioId = datos.servicioId ?? servicioDelDia(reloj);

  const racion = racionSchema.parse({
    personaCodigoP: datos.personaCodigoP,
    servicioId,
    componentes: [],
    // `racionSchema.cobertura` exige una entrada por nutriente del contrato.
    // El calculo es de `packages/nutrition` y no esta conectado: un 0 aqui es
    // "sin calculo", no un dato. La pantalla muestra `sin dato`, nunca el 0.
    cobertura: COBERTURA_SIN_CALCULO,
    razones: [...datos.razones],
    // Sin nutricionista en la ventana (MODO-6H §2): el origen es explicito.
    modo: 'automatico',
    versionMenu: MENU_VERSION,
  });

  // Una racion y su evento entran juntos: si el `add` choca con la clave
  // compuesta, la transaccion aborta y el outbox no se queda con un pendiente
  // de una racion que no existe.
  let evento: NuevoEvento;
  try {
    evento = await base.transaction('rw', base.raciones, base.meta, base.outbox, async () => {
      await base.raciones.add(racion);

      const lamport = await siguienteLamport(base);
      const eventUuid = idDeEvento(reloj);
      const nuevoEvento: NuevoEvento = {
        eventUuid,
        idempotencyKey: eventUuid,
        lamport,
        deviceId: DEVICE_DEMO,
        ollaId,
        entidad: 'raciones',
        op: 'upsert',
        payload: racion,
        creadoEn: reloj.ahora(),
      };
      await outboxDe(base).encolarEnTransaccion(nuevoEvento, base.outbox);
      return nuevoEvento;
    });
  } catch (error) {
    if (error instanceof Dexie.ConstraintError) {
      throw new RacionDuplicada(racion.personaCodigoP, servicioId);
    }
    throw error;
  }

  // Confirmado en disco: ahora si es un pendiente para el badge.
  outboxDe(base).registrarConfirmado(evento);

  return racion;
}

/**
 * Racion de una persona en un servicio (por defecto, el de hoy). Con la clave
 * compuesta ya no existe "la racion de la persona": hay una por servicio.
 */
export async function racionDe(
  codigoP: string,
  ollaId: string = OLLA_DEMO,
  servicioId: string = servicioDelDia(),
): Promise<Racion | undefined> {
  return baseDeOlla(ollaId).raciones.get([codigoP, servicioId]);
}
