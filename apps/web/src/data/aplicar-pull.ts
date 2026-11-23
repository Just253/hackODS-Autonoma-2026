/**
 * Aplica a Dexie lo que trajo `sync-pull`.
 *
 * Solo tres entidades tienen tabla local hoy: `personas`, `movimientos` y
 * `precios`. Las demas (`raciones`, `solicitudes`, `menus`, `consentimiento`)
 * se cuentan como ignoradas: no se guardan en una tabla que no existe ni se
 * fuerzan en una que no les corresponde.
 *
 * Reglas:
 *
 * - Cada payload se valida con el schema de `@hackods/contracts` ANTES de
 *   escribir: un evento viejo o de otra version no entra "para arreglarlo
 *   despues" (mismo criterio que `altaPersona`).
 * - `put` y no `add`: el mismo evento puede llegar dos veces (cursor perdido,
 *   reintento) y tiene que quedar una sola fila.
 * - Un evento de otra olla se ignora: la base local es de UNA olla.
 * - `op: 'delete'` se ignora: `personas` y `movimientos` son append-only y el
 *   contrato de baja es `deletedAt`, no un borrado local. Queda contado.
 */
import { movimientoSchema, personaSchema, precioSchema } from '@hackods/contracts';
import type { EventoEnviado } from '@hackods/sync';

import type { BaseOlla } from './base.js';

export interface ResumenPull {
  readonly aplicados: number;
  readonly ignorados: number;
  readonly invalidos: number;
}

export async function aplicarEventos(
  base: BaseOlla,
  ollaId: string,
  eventos: readonly EventoEnviado[],
): Promise<ResumenPull> {
  let aplicados = 0;
  let ignorados = 0;
  let invalidos = 0;

  for (const evento of eventos) {
    if (evento.ollaId !== ollaId || evento.op === 'delete') {
      ignorados += 1;
      continue;
    }

    if (evento.entidad === 'personas') {
      const parseada = personaSchema.safeParse(evento.payload);
      if (!parseada.success) {
        invalidos += 1;
        continue;
      }
      await base.personas.put(parseada.data);
      aplicados += 1;
      continue;
    }

    if (evento.entidad === 'movimientos') {
      const parseado = movimientoSchema.safeParse(evento.payload);
      if (!parseado.success) {
        invalidos += 1;
        continue;
      }
      await base.movimientos.put(parseado.data);
      aplicados += 1;
      continue;
    }

    if (evento.entidad === 'precios') {
      const parseado = precioSchema.safeParse(evento.payload);
      if (!parseado.success) {
        invalidos += 1;
        continue;
      }
      await base.precios.put(parseado.data);
      aplicados += 1;
      continue;
    }

    ignorados += 1;
  }

  return { aplicados, ignorados, invalidos };
}
