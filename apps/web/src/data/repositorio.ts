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

/** Reloj y azar inyectables: el test no depende de la hora ni del azar reales. */
export interface Reloj {
  readonly ahora: () => string;
  readonly azar: Azar;
}

const relojGlobal: Reloj = {
  ahora: () => new Date().toISOString(),
  azar: () => Math.random(),
};

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

  return base.transaction('rw', base.personas, base.identidadLocal, base.meta, async () => {
    const ocupados = new Set((await base.personas.toCollection().primaryKeys()) as string[]);
    const codigoP = generarCodigoPLibre(ocupados, reloj.azar);
    const lamport = await siguienteLamport(base);

    const persona = personaSchema.parse({
      codigoP,
      ollaId,
      anioNacimiento: datos.anioNacimiento,
      sexo: datos.sexo,
      categoria: datos.categoria,
      anemia: 'sin_dato',
      pesoKg: null,
      tallaCm: null,
      consentimientoSeguimiento: false,
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
    await base.identidadLocal.add(identidad);

    return { persona, identidad };
  });
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
  readonly servicioId: string | null;
  readonly razones: readonly string[];
}

/**
 * Racion servida. Append-only: si ya existe se reemplaza por la ultima version
 * del mismo dia, nunca se acumulan dos filas para la misma persona y servicio.
 * `racionSchema` exige >= 2 razones: la pantalla no puede inventar una sola.
 *
 * `componentes` y `cobertura` quedan vacios a proposito: el calculo por grupo
 * es de `packages/nutrition` (fuera de este write-set) y un cero dibujado como
 * dato seria peor que `sin dato`.
 */
export async function guardarRacion(
  datos: NuevaRacion,
  ollaId: string = OLLA_DEMO,
): Promise<Racion> {
  const base = baseDeOlla(ollaId);

  const racion = racionSchema.parse({
    personaCodigoP: datos.personaCodigoP,
    servicioId: datos.servicioId,
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

  await base.raciones.put(racion);
  return racion;
}

export async function racionDe(
  codigoP: string,
  ollaId: string = OLLA_DEMO,
): Promise<Racion | undefined> {
  return baseDeOlla(ollaId).raciones.get(codigoP);
}
