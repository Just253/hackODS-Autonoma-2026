import Dexie, { type EntityTable, type Table } from 'dexie';
import type { IdentidadLocal, Movimiento, Persona, Racion } from '@hackods/contracts';
import type { RegistroConsentimiento, ServicioDeReceta } from '@hackods/domain';
import type { EventoSaliente } from '@hackods/sync';

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
export const VERSION_ESQUEMA = 6;

export interface RegistroLamport {
  readonly clave: 'lamport';
  readonly valor: number;
}

/**
 * Firma de consentimiento tal como vive en Dexie.
 *
 * No hay una segunda definición de la forma: es `RegistroConsentimiento` de
 * `@hackods/domain` (la regla pura de otorgar/revocar/vigente) más el `ollaId`
 * que la tabla necesita para separar ollas en el dispositivo. La tabla es
 * append-only igual que en el servidor: cada firma es una fila con su `id`.
 */
export type ConsentimientoLocal = RegistroConsentimiento & { readonly ollaId: string };

/**
 * Fila del outbox tal como vive en Dexie.
 *
 * El contrato de este registro es `EventoSaliente` de `@hackods/sync`; aca
 * solo se le agrega lo que el contrato no modela y Dexie necesita: `estado`
 * ("pendiente" hasta que el `SyncPort` lo confirma), para filtrar sin releer
 * todo en cada arranque y poder mostrar el badge sin la red. No hay una segunda
 * definicion del esquema: es `EventoSaliente & { estado }` (apps/web/AGENTS.md,
 * "El esquema del outbox: packages/sync").
 */
export type EventoOutbox = EventoSaliente & { estado: 'pendiente' };
export type BaseOlla = Dexie & {
  personas: EntityTable<Persona, 'codigoP'>;
  /** Clave compuesta: `EntityTable` solo admite una propiedad, asi que va `Table`. */
  raciones: Table<Racion, [string, string]>;
  identidadLocal: EntityTable<IdentidadLocal, 'codigoP'>;
  /** Firmas de consentimiento: append-only, una fila por firma. */
  consentimiento: EntityTable<ConsentimientoLocal, 'id'>;
  meta: EntityTable<RegistroLamport, 'clave'>;
  /**
   * `eventUuid` como clave = idempotencia gratis: guardar el mismo evento no
   * crea una fila nueva. El indice compuesto `[lamport+deviceId]` es el orden
   * contractual de envio (nunca `creadoEn`); `estado` filtra los pendientes.
   */
  outbox: Table<EventoOutbox, string>;
  /**
   * Movimientos append-only de la despensa: el stock se deriva sumandolos
   * (docs/DECISIONES.md D4). `[ollaId+insumoId]` es el indice del saldo por
   * insumo; `at` ordena la historia sin depender de `createdAt`.
   */
  movimientos: EntityTable<Movimiento, 'id'>;
  /**
   * Servicio cocinado con receta, comensales por grupo, cocinero, 75 °C y
   * costo. Todavia no es el contrato `Servicio` (no tiene esos campos): vive
   * local y marcado como tal hasta que #62/#65 lo lleven a SQL.
   */
  serviciosCocidos: EntityTable<ServicioDeReceta, 'id'>;
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

  // v4: outbox persistente. Hasta aca el encolado vivia en memoria y una
  // recarga perdia los cambios sin avisar. La tabla es aditiva: no migra datos,
  // las bases v3 quedan con el outbox vacio, que es la verdad (nada pendiente).
  base.version(4).stores({
    outbox: 'eventUuid, [lamport+deviceId], estado',
  });

  // v5: recetario -> produccion. `movimientos` es append-only (nunca un saldo
  // mutable) y `serviciosCocidos` guarda el cierre local del servicio. Ambas
  // son aditivas: una base v4 arranca con las dos vacias, que es la verdad.
  base.version(5).stores({
    movimientos: 'id, ollaId, insumoId, [ollaId+insumoId], at',
    serviciosCocidos: 'id, ollaId, recetaId, fecha, [ollaId+fecha]',
  });

  // v6: consentimiento append-only (#74). Tabla nueva, aditiva: una base v5
  // queda con cero firmas, que es "sin registro" y no "otorgado" ni "revocado".
  // `id` es la clave (cada firma es una fila, nunca un UPDATE); `personaId` y
  // `[personaId+tipo]` son las dos lecturas de la pantalla: "todas las firmas
  // de esta persona" y "la última de este permiso".
  base.version(6).stores({
    consentimiento: 'id, ollaId, personaId, [personaId+tipo], lamport',
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
