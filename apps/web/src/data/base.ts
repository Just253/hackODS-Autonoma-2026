import Dexie, { type EntityTable, type Table } from 'dexie';
import type { IdentidadLocal, Persona, Racion } from '@hackods/contracts';

/**
 * Persistencia local de la olla (`pwa-offline`: una base por olla).
 *
 * Dos clases de datos, dos tablas, para que no se mezclen nunca:
 *
 * - `personas` y `raciones` son entidades sincronizables: ya validas con Zod
 *   (`personaSchema`, `racionSchema` de `@hackods/contracts`) y lo unico que
 *   eventualmente viajaria al servidor.
 * - `identidadLocal` NO es sincronizable: `nombreLocal` y `alias` viven aca,
 *   marcados `localOnly: true` (DEC-2026-0002). Ningun serializador del outbox
 *   lee esta tabla.
 *
 * `meta` guarda el contador de Lamport del dispositivo (nunca `Date.now()`).
 */

/**
 * Version del esquema local. Cambio incompatible = version nueva + migracion.
 *
 * v2 y v3 son un solo cambio: `raciones` pasa de clave primaria
 * `personaCodigoP` (una racion por persona para siempre, imposible de acumular)
 * a la clave compuesta `[personaCodigoP+servicioId]`, que es lo que exige una
 * tabla append-only: una fila por persona y servicio, nunca dos para el mismo
 * dia. Dexie no cambia una clave primaria en el lugar ("Not yet support for
 * changing primary key"), asi que v2 tira la tabla y v3 la crea de nuevo. Las
 * raciones de v1 (una por persona, con `servicioId: null`) se pierden: es
 * pre-release y esas filas ni siquiera pueden formar la clave compuesta, porque
 * `null` no es un componente valido en IndexedDB.
 */
export const VERSION_ESQUEMA = 3;

export interface RegistroLamport {
  readonly clave: 'lamport';
  readonly valor: number;
}

export type BaseOlla = Dexie & {
  personas: EntityTable<Persona, 'codigoP'>;
  /** Clave compuesta: `EntityTable` solo admite una propiedad, asi que va `Table`. */
  raciones: Table<Racion, [string, string]>;
  identidadLocal: EntityTable<IdentidadLocal, 'codigoP'>;
  meta: EntityTable<RegistroLamport, 'clave'>;
};

export function nombreBase(ollaId: string): string {
  return `hackods-${ollaId}`;
}

/** Una sola instancia por olla: abrir dos Dexie a la misma base traba el navegador. */
const abiertas = new Map<string, BaseOlla>();

export function baseDeOlla(ollaId: string): BaseOlla {
  const existente = abiertas.get(ollaId);
  if (existente !== undefined) {
    return existente;
  }

  const base = new Dexie(nombreBase(ollaId)) as BaseOlla;

  base.version(1).stores({
    personas: 'codigoP, categoria, anioNacimiento',
    raciones: 'personaCodigoP, servicioId',
    identidadLocal: 'codigoP',
    meta: 'clave',
  });

  // v2: tira `raciones`; su clave primaria no se puede cambiar en el lugar.
  base.version(2).stores({ raciones: null });

  // v3: la vuelve a crear, ya con la clave compuesta persona + servicio.
  base.version(3).stores({
    raciones: '[personaCodigoP+servicioId], personaCodigoP, servicioId',
  });

  abiertas.set(ollaId, base);
  return base;
}

/** Solo para tests: cierra y olvida las conexiones abiertas. */
export function cerrarBases(): void {
  for (const base of abiertas.values()) {
    base.close();
  }
  abiertas.clear();
}
