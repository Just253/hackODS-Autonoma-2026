import { describe, expect, it } from 'vitest';

import type { SolicitudItem } from '@hackods/contracts';

import { DatoFaltante, TransicionInvalida, UnidadNoSoportada } from './errors.js';
import {
  crearSolicitud,
  resolverSolicitud,
  type SolicitudEntreOllas,
} from './solicitud.js';

const ARROZ_20KG: SolicitudItem = {
  insumoId: 'arroz',
  cantidad: 20,
  unidad: 'kg',
  nota: null,
};

const AHORA = '2026-11-23T10:00:00.000Z';

/** UUIDs fijos: el dominio es determinista y no genera ids (los trae el caller). */
const IDS = {
  origen: '0f0e0d0c-0b0a-4908-8706-050403020100',
  destino: '1a1b1c1d-1e1f-4a2b-8c3d-4e5f60718293',
} as const;

function nueva(): SolicitudEntreOllas {
  return crearSolicitud({
    id: 'sol_1',
    ollaOrigenId: 'olla_1',
    ollaDestinoId: 'olla_2',
    items: [ARROZ_20KG],
    ahora: AHORA,
  });
}

/** Una solicitud ya en `enviada`, como la del seed (`seed.sql`~143). */
function enviada(): SolicitudEntreOllas {
  return resolverSolicitud(nueva(), 'enviar', { ahora: AHORA }).solicitud;
}

/** Lleva una solicitud fresca hasta `aceptada` (borrador -> enviada -> aceptada). */
function aceptada(): SolicitudEntreOllas {
  return resolverSolicitud(enviada(), 'aprobar', { ahora: AHORA }).solicitud;
}

describe('crearSolicitud', () => {
  it('nace en borrador (pendiente) y no mueve stock', () => {
    const s = nueva();
    expect(s.estado).toBe('borrador');
    expect(s.createdAt).toBe(AHORA);
    expect(s.updatedAt).toBe(AHORA);
    // 20 kg de arroz: la cantidad queda tal cual la pide la olla.
    expect(s.items).toHaveLength(1);
    expect(s.items[0]?.cantidad).toBe(20);
  });
});

describe('resolverSolicitud: transiciones validas', () => {
  it('borrador -> enviada: no genera movimientos', () => {
    const { solicitud, movimientos } = resolverSolicitud(nueva(), 'enviar', { ahora: AHORA });
    expect(solicitud.estado).toBe('enviada');
    expect(movimientos).toEqual([]);
  });

  it('enviada -> aceptada: no genera movimientos', () => {
    const { solicitud, movimientos } = resolverSolicitud(enviada(), 'aprobar', { ahora: AHORA });
    expect(solicitud.estado).toBe('aceptada');
    expect(movimientos).toEqual([]);
  });

  it('aceptada -> entregada: devuelve el PAR de transferencia, no lo escribe', () => {
    const aprobada = aceptada();
    const { solicitud, movimientos } = resolverSolicitud(aprobada, 'entregar', {
      ahora: '2026-11-23T11:00:00.000Z',
      autor: 'cocinera-1',
      ids: IDS,
    });

    expect(solicitud.estado).toBe('entregada');
    // La solicitud entregada NO cambia items: el stock no vive en ella.
    expect(solicitud.items).toEqual(aprobada.items);

    // Dos movimientos `transferencia`: origen negativo y destino positivo.
    expect(movimientos).toHaveLength(2);
    const [origen, destino] = movimientos;
    expect(origen?.motivo).toBe('transferencia');
    expect(origen?.id).toBe(IDS.origen);
    expect(origen?.ollaId).toBe('olla_1');
    expect(origen?.delta).toBe(-20000);
    expect(destino?.motivo).toBe('transferencia');
    expect(destino?.id).toBe(IDS.destino);
    expect(destino?.ollaId).toBe('olla_2');
    expect(destino?.delta).toBe(20000);
    expect(destino?.autor).toBe('cocinera-1');
    expect(destino?.at).toBe('2026-11-23T11:00:00.000Z');
  });

  it('la transferencia conserva stock: la suma de los deltas es 0', () => {
    const { movimientos } = resolverSolicitud(aceptada(), 'entregar', { ahora: AHORA, ids: IDS });
    const suma = movimientos.reduce((acc, m) => acc + m.delta, 0);
    expect(suma).toBe(0);
    // Y son dos, no uno: un solo movimiento positivo crearia +20 kg netos.
    expect(movimientos).toHaveLength(2);
  });

  it('los ids de los movimientos son UUID validos (columna movimientos.id)', () => {
    const { movimientos } = resolverSolicitud(aceptada(), 'entregar', { ahora: AHORA, ids: IDS });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const movimiento of movimientos) {
      expect(movimiento.id).toMatch(uuid);
    }
    // Y son los que dio el caller, no interpolaciones de la solicitud.
    expect(movimientos.map((m) => m.id)).toEqual([IDS.origen, IDS.destino]);
  });

  it('sin ids al entregar lanza DatoFaltante (no interpola un id no-UUID)', () => {
    expect(() => resolverSolicitud(aceptada(), 'entregar', { ahora: AHORA })).toThrow(DatoFaltante);
  });

  it('borrador|enviada|aceptada -> cancelada: no genera movimientos', () => {
    for (const estado of [nueva(), enviada(), aceptada()]) {
      const { solicitud, movimientos } = resolverSolicitud(estado, 'cancelar', { ahora: AHORA });
      expect(solicitud.estado).toBe('cancelada');
      expect(movimientos).toEqual([]);
    }
  });
});

describe('resolverSolicitud: el caso del seed (solicitud en "enviada")', () => {
  it('una solicitud "enviada" se aprueba y se entrega', () => {
    const { solicitud: aprobada, movimientos: m1 } = resolverSolicitud(enviada(), 'aprobar', {
      ahora: AHORA,
    });
    expect(aprobada.estado).toBe('aceptada');
    expect(m1).toEqual([]);

    const { solicitud: entregada, movimientos: m2 } = resolverSolicitud(aprobada, 'entregar', {
      ahora: AHORA,
      ids: IDS,
    });
    expect(entregada.estado).toBe('entregada');
    expect(m2).toHaveLength(2);
    expect(m2.reduce((acc, m) => acc + m.delta, 0)).toBe(0);
  });
});

describe('resolverSolicitud: ningun salto de estado', () => {
  it('no se puede aprobar sin enviar', () => {
    expect(() => resolverSolicitud(nueva(), 'aprobar', { ahora: AHORA })).toThrow(TransicionInvalida);
  });

  it('no se puede entregar sin aceptar', () => {
    expect(() => resolverSolicitud(enviada(), 'entregar', { ahora: AHORA })).toThrow(
      TransicionInvalida,
    );
  });

  it('no se puede enviar dos veces', () => {
    expect(() => resolverSolicitud(enviada(), 'enviar', { ahora: AHORA })).toThrow(
      TransicionInvalida,
    );
  });

  it('entregada es terminal: no se aprueba ni se cancela ni se entrega', () => {
    const entregada = resolverSolicitud(aceptada(), 'entregar', { ahora: AHORA, ids: IDS }).solicitud;
    for (const decision of ['enviar', 'aprobar', 'entregar', 'cancelar'] as const) {
      expect(() => resolverSolicitud(entregada, decision, { ahora: AHORA })).toThrow(
        TransicionInvalida,
      );
    }
  });

  it('no se puede entregar una cancelada', () => {
    const cancelada = resolverSolicitud(aceptada(), 'cancelar', { ahora: AHORA }).solicitud;
    expect(() => resolverSolicitud(cancelada, 'entregar', { ahora: AHORA })).toThrow(
      TransicionInvalida,
    );
  });

  it('el error tipado lleva estado actual e intento', () => {
    let error: unknown;
    try {
      resolverSolicitud(nueva(), 'entregar', { ahora: AHORA });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TransicionInvalida);
    expect((error as TransicionInvalida).estadoActual).toBe('borrador');
    expect((error as TransicionInvalida).intento).toBe('entregada');
  });
});

describe('resolverSolicitud: unidad no soportada', () => {
  it('una unidad sin factor a gramos (taza) lanza UnidadNoSoportada', () => {
    const conTaza = crearSolicitud({
      id: 'sol_taza',
      ollaOrigenId: 'olla_1',
      ollaDestinoId: 'olla_2',
      items: [{ insumoId: 'arroz', cantidad: 3, unidad: 'taza', nota: null }],
      ahora: AHORA,
    });
    const aprobada = resolverSolicitud(
      resolverSolicitud(conTaza, 'enviar', { ahora: AHORA }).solicitud,
      'aprobar',
      { ahora: AHORA },
    ).solicitud;

    expect(() => resolverSolicitud(aprobada, 'entregar', { ahora: AHORA })).toThrow(
      UnidadNoSoportada,
    );
  });
});
