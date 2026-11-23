import type { ResultadoPull, ResultadoPush, EstadoSync, SyncPort } from '@hackods/sync';

import type { OutboxDexie } from './outbox-repo.js';

/**
 * `SyncPort` local y falso, para la ventana de 6 horas (MODO-6H sec. 5: no hay
 * Supabase en la demo, Docker no esta corriendo).
 *
 * No hay `fetch`, ni red, ni `navigator.onLine`: `push()` toma el primer lote
 * del outbox, lo da por aceptado y lo marca enviado en Dexie. `pull()` no trae
 * nada. Asi el badge puede pasar de "N cambios pendientes" a "Sincronizado
 * (local)" con una accion real sobre el outbox, sin fingir una respuesta de
 * servidor: cuando exista el adaptador de Supabase, este modulo se reemplaza y
 * la interfaz no cambia.
 */

export class SyncLocal implements SyncPort {
  private readonly outbox: OutboxDexie;
  private readonly reloj: () => string;
  private ultima: string | undefined;

  constructor(outbox: OutboxDexie, reloj: () => string = () => new Date().toISOString()) {
    this.outbox = outbox;
    this.reloj = reloj;
  }

  /**
   * Envia (localmente) el primer lote. Marca cada evento como enviado y espera
   * la escritura a Dexie: si se recarga justo despues, el pendiente ya no esta.
   */
  async push(): Promise<ResultadoPush> {
    const lote = this.outbox.lote();
    const aceptados: string[] = [];

    for (const evento of lote) {
      this.outbox.marcarEnviado(evento.eventUuid);
      aceptados.push(evento.idempotencyKey);
    }

    await this.outbox.asentar();
    this.ultima = this.reloj();

    return {
      aceptados,
      duplicados: [],
      rechazados: [],
      pendientes: this.outbox.total(),
    };
  }

  /** Sin servidor no hay nada que traer: cursor en cero y lista vacia. */
  async pull(_since?: number): Promise<ResultadoPull> {
    return {
      eventos: [],
      cursor: { lamport: 0, deviceId: '' },
    };
  }

  status(): EstadoSync {
    return {
      pendientes: this.outbox.total(),
      ...(this.ultima === undefined ? {} : { ultimaSync: this.ultima }),
    };
  }
}