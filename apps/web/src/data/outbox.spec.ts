import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NuevoEvento } from '@hackods/sync';

import { baseDeOlla, cerrarBases } from './base.js';
import { outboxDe } from './outbox-repo.js';
import { DEVICE_DEMO, OLLA_DEMO, RacionDuplicada, altaPersona, guardarRacion } from './repositorio.js';
import { SyncLocal } from './sync-local.js';

/**
 * Outbox real sobre Dexie, red apagada (test/setup.ts deja `fetch` tirando).
 * Lo que importa probar: idempotencia por `eventUuid`, orden `(lamport,
 * deviceId)`, que sobreviva la reapertura, que el evento no lleve PII y que un
 * push local vacie los pendientes sin tocar la red.
 */

const RELOJ = {
  ahora: () => '2026-11-23T10:00:00.000Z',
  azar: () => 0.1,
} as const;

function borrarBase(): Promise<void> {
  cerrarBases();
  return new Promise<void>((listo, falla) => {
    const pedido = indexedDB.deleteDatabase(`hackods-${OLLA_DEMO}`);
    pedido.onsuccess = () => listo();
    pedido.onerror = () => falla(pedido.error ?? new Error('no se pudo borrar la base'));
    pedido.onblocked = () => falla(new Error('borrado bloqueado: conexion abierta'));
  });
}

function evento(over: Partial<NuevoEvento> = {}): NuevoEvento {
  const eventUuid = over.eventUuid ?? 'ev-1';
  return {
    eventUuid,
    idempotencyKey: eventUuid,
    lamport: 1,
    deviceId: DEVICE_DEMO,
    ollaId: OLLA_DEMO,
    entidad: 'personas',
    op: 'upsert',
    payload: { codigoP: 'P-2345' },
    creadoEn: '2026-11-23T10:00:00.000Z',
    ...over,
  };
}

beforeEach(async () => {
  await borrarBase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await borrarBase();
});

describe('outbox en Dexie', () => {
  it('encolar el mismo eventUuid dos veces deja un solo evento (idempotencia)', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();

    outbox.encolar(evento({ eventUuid: 'ev-duplicado', lamport: 1 }));
    outbox.encolar(evento({ eventUuid: 'ev-duplicado', lamport: 99 }));
    await outbox.asentar();

    expect(outbox.total()).toBe(1);
    // El primero manda: el segundo encolado es un no-op, no un reemplazo.
    expect(outbox.pendientes()[0]?.lamport).toBe(1);
    // Persistido: una sola fila en la tabla.
    expect(await baseDeOlla(OLLA_DEMO).outbox.count()).toBe(1);
  });

  it('la idempotencia vale en la tabla, no solo en el espejo (sin cargar())', async () => {
    // Fila ya en disco, escrita sin pasar por el outbox: simula la base de una
    // sesion anterior. El espejo de la instancia nueva arranca vacio a
    // proposito: no se llama `cargar()`, asi que la unica defensa posible
    // contra el duplicado es la guarda de la tabla (`tabla.get`).
    await baseDeOlla(OLLA_DEMO).outbox.add(
      {
        eventUuid: 'ev-en-disco',
        idempotencyKey: 'ev-en-disco',
        lamport: 1,
        deviceId: DEVICE_DEMO,
        ollaId: OLLA_DEMO,
        entidad: 'personas',
        op: 'upsert',
        payload: { codigoP: 'P-2345' },
        creadoEn: '2026-11-23T10:00:00.000Z',
        intentos: 0,
        ultimoError: null,
        estado: 'pendiente',
      },
    );

    // Sesion nueva sobre la misma base: espejo vacio, sin `cargar()`.
    cerrarBases();
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    expect(outbox.total()).toBe(0);

    const entro = await outbox.encolarEnTransaccion(evento({ eventUuid: 'ev-en-disco' }));

    expect(entro).toBe(false);
    // Si la guarda de la tabla se cae, el `add` tira `ConstraintError` o deja
    // dos filas: cualquiera de las dos rompe esta asercion.
    expect(await baseDeOlla(OLLA_DEMO).outbox.count()).toBe(1);
  });

  it('ordena por (lamport, deviceId) y no por orden de insercion', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();

    outbox.encolar(evento({ eventUuid: 'c', lamport: 3 }));
    outbox.encolar(evento({ eventUuid: 'a', lamport: 1 }));
    outbox.encolar(evento({ eventUuid: 'b', lamport: 2, deviceId: 'dispositivo-z' }));
    await outbox.asentar();

    expect(outbox.pendientes().map((e) => e.eventUuid)).toEqual(['a', 'b', 'c']);
    expect(outbox.lote(2).map((e) => e.eventUuid)).toEqual(['a', 'b']);
  });

  it('sobrevive a reabrir la base: el pendiente sigue ahi', async () => {
    const primera = outboxDe(baseDeOlla(OLLA_DEMO));
    await primera.cargar();
    primera.encolar(evento({ eventUuid: 'ev-persistente' }));
    await primera.asentar();

    // Simula recarga: cierra y abre una conexion nueva a la misma base.
    cerrarBases();
    const segunda = outboxDe(baseDeOlla(OLLA_DEMO));
    await segunda.cargar();

    expect(segunda.total()).toBe(1);
    expect(segunda.pendientes()[0]?.eventUuid).toBe('ev-persistente');
  });

  it('altaPersona encola su evento en la misma transaccion, sin PII', async () => {
    const { persona } = await altaPersona(
      {
        anioNacimiento: 1958,
        sexo: 'F',
        categoria: 'adulto_mayor',
        nombreLocal: 'NOMBRE-QUE-NO-DEBE-VIAJAR',
        alias: 'ALIAS-PRIVADO',
      },
      RELOJ,
    );

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    const [ev] = outbox.pendientes();

    expect(ev?.entidad).toBe('personas');
    expect(ev?.eventUuid).toBe(ev?.idempotencyKey);
    expect(ev?.payload).toEqual(persona);
    const serializado = JSON.stringify(ev?.payload);
    expect(serializado).not.toContain('NOMBRE-QUE-NO-DEBE-VIAJAR');
    expect(serializado).not.toContain('ALIAS-PRIVADO');
    expect(serializado).toContain('P-');
  });

  it('guardarRacion encola el evento y un duplicado no deja pendiente extra', async () => {
    await altaPersona(
      { anioNacimiento: 1990, sexo: 'M', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ,
    );
    await guardarRacion({ personaCodigoP: 'P-2345', razones: ['gestante', 'bajo_peso'] }, RELOJ);

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    const raciones = outbox.pendientes().filter((e) => e.entidad === 'raciones');
    expect(raciones).toHaveLength(1);
    expect(raciones[0]?.lamport).toBeGreaterThan(outbox.pendientes()[0]?.lamport ?? 0);
  });

  it('push local marca enviados y deja el outbox vacio, sin red', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    outbox.encolar(evento({ eventUuid: 'ev-x', lamport: 1 }));
    outbox.encolar(evento({ eventUuid: 'ev-y', lamport: 2 }));
    await outbox.asentar();

    const resultado = await new SyncLocal(outbox, RELOJ.ahora).push();

    expect(resultado.aceptados).toEqual(['ev-x', 'ev-y']);
    expect(resultado.pendientes).toBe(0);
    expect(outbox.total()).toBe(0);
    expect(new SyncLocal(outbox).status().pendientes).toBe(0);
    expect(await baseDeOlla(OLLA_DEMO).outbox.count()).toBe(0);
  });

  it('avisa a sus oyentes cuando cambia el conjunto de pendientes', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();

    let avisos = 0;
    const quitar = outbox.suscribir(() => {
      avisos += 1;
    });

    outbox.encolar(evento({ eventUuid: 'ev-o1' }));
    expect(outbox.total()).toBe(1);
    expect(avisos).toBe(1);

    outbox.marcarError('ev-o1', 'fallo de prueba');
    expect(avisos).toBe(2);
    // El evento sigue pendiente: un error no lo descarta.
    expect(outbox.total()).toBe(1);

    outbox.marcarEnviado('ev-o1');
    expect(outbox.total()).toBe(0);
    expect(avisos).toBe(3);

    outbox.registrarConfirmado(evento({ eventUuid: 'ev-o2' }));
    expect(outbox.total()).toBe(1);
    expect(avisos).toBe(4);

    // Desuscrito no recibe nada mas.
    quitar();
    outbox.marcarEnviado('ev-o2');
    expect(avisos).toBe(4);
    await outbox.asentar();
  });

  it('una transaccion que aborta no deja pendiente ni avisa al badge', async () => {
    await altaPersona(
      { anioNacimiento: 1990, sexo: 'M', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ,
    );
    await guardarRacion({ personaCodigoP: 'P-2345', razones: ['gestante', 'bajo_peso'] }, RELOJ);

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    const antes = outbox.total();

    let avisos = 0;
    outbox.suscribir(() => {
      avisos += 1;
    });

    // `RacionDuplicada` aborta la transaccion: ni fila en el outbox ni aviso.
    await expect(
      guardarRacion({ personaCodigoP: 'P-2345', razones: ['bajo_peso', 'gestante'] }, RELOJ),
    ).rejects.toThrow(RacionDuplicada);

    expect(avisos).toBe(0);
    expect(outbox.total()).toBe(antes);
    expect(await baseDeOlla(OLLA_DEMO).outbox.count()).toBe(antes);
  });
});