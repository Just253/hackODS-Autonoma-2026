import Dexie, { type EntityTable } from 'dexie';
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

/** Version del esquema local. Cambio incompatible = v2 + migracion en `upgrade`. */
export const VERSION_ESQUEMA = 1;

export interface RegistroLamport {
  readonly clave: 'lamport';
  readonly valor: number;
}

export type BaseOlla = Dexie & {
  personas: EntityTable<Persona, 'codigoP'>;
  raciones: EntityTable<Racion, 'personaCodigoP'>;
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

  base.version(VERSION_ESQUEMA).stores({
    personas: 'codigoP, categoria, anioNacimiento',
    raciones: 'personaCodigoP, servicioId',
    identidadLocal: 'codigoP',
    meta: 'clave',
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
