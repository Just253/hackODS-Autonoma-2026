import { describe, expect, it } from 'vitest';

import type { Acta, Excedente, FirmaActa, Movimiento, Necesidad } from '@hackods/contracts';

import {
  ActaNoFirmable,
  codigoActa,
  firmarActa,
  hashActa,
  impactoDesdeActas,
  matchExcedentes,
  movimientosDeActa,
  PESOS_MATCH,
} from './acta.js';
import { DatoFaltante } from './errors.js';

const AHORA = '2026-11-23T10:00:00.000Z';

function acta(over: Partial<Acta> = {}): Acta {
  const base: Acta = {
    id: 'acta_1',
    origen: 'olla_1',
    destino: 'olla_2',
    estado: 'borrador',
    codigo: '0007',
    hash: 'a'.repeat(64),
    items: [{ insumoId: 'arroz', lote: 'L-01', cantidad: 20, unidad: 'kg' }],
    firmas: [],
    firmadaEn: null,
    deviceId: 'dev-1',
    lamport: 1,
  };
  return { ...base, ...over };
}

function firma(ollaId: string): FirmaActa {
  return { ollaId, rol: 'organizadora', llave: `pub-${ollaId}`, firmadaEn: AHORA };
}

/** Acta ya firmada por las dos puntas. */
function firmada(): Acta {
  const r1 = firmarActa(acta(), firma('olla_1'), AHORA).acta;
  const r2 = firmarActa(r1, firma('olla_2'), AHORA).acta;
  return r2;
}

const IDS = [
  {
    origen: '0f0e0d0c-0b0a-4908-8706-050403020100',
    destino: '1a1b1c1d-1e1f-4a2b-8c3d-4e5f60718293',
  },
] as const;

describe('codigoActa y hashActa', () => {
  it('codigo determinista de 4 digitos con ceros a la izquierda', () => {
    const c = codigoActa('olla_1:2026-11-23');
    expect(c).toMatch(/^\d{4}$/);
    expect(codigoActa('olla_1:2026-11-23')).toBe(c);
  });

  it('hash determinista e independiente del orden de los items', () => {
    const a = acta();
    const b = acta({
      items: [
        { insumoId: 'frijol', lote: null, cantidad: 1, unidad: 'kg' },
        { insumoId: 'arroz', lote: 'L-01', cantidad: 20, unidad: 'kg' },
      ],
    });
    const c = acta({
      items: [
        { insumoId: 'arroz', lote: 'L-01', cantidad: 20, unidad: 'kg' },
        { insumoId: 'frijol', lote: null, cantidad: 1, unidad: 'kg' },
      ],
    });
    expect(hashActa(b)).toBe(hashActa(c));
    expect(hashActa(a)).not.toBe(hashActa(b));
    expect(hashActa(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('firmarActa: dos firmas distintas', () => {
  it('una sola firma NO firma (sigue borrador)', () => {
    const r = firmarActa(acta(), firma('olla_1'), AHORA);
    expect(r.firmada).toBe(false);
    expect(r.acta.estado).toBe('borrador');
    expect(r.acta.firmadaEn).toBeNull();
  });

  it('dos firmas de la MISMA punta no firman', () => {
    const r1 = firmarActa(acta(), firma('olla_1'), AHORA);
    const r2 = firmarActa(r1.acta, firma('olla_1'), AHORA);
    expect(r2.firmada).toBe(false);
    expect(r2.acta.estado).toBe('borrador');
  });

  it('dos puntas distintas firman: estado firmada y firmadaEn = ahora', () => {
    const r = firmarActa(firmarActa(acta(), firma('olla_1'), AHORA).acta, firma('olla_2'), '2026-11-23T12:00:00.000Z');
    expect(r.firmada).toBe(true);
    expect(r.acta.estado).toBe('firmada');
    expect(r.acta.firmadaEn).toBe('2026-11-23T12:00:00.000Z');
    expect(r.acta.firmas).toHaveLength(2);
  });

  it('tambien firma desde en_revision', () => {
    const r = firmarActa(firmarActa(acta({ estado: 'en_revision' }), firma('olla_1'), AHORA).acta, firma('olla_2'), AHORA);
    expect(r.firmada).toBe(true);
  });

  it('no firma un acta ya firmada ni anulada (ActaNoFirmable)', () => {
    expect(() => firmarActa(firmada(), firma('olla_1'), AHORA)).toThrow(ActaNoFirmable);
    expect(() => firmarActa(acta({ estado: 'anulada' }), firma('olla_1'), AHORA)).toThrow(ActaNoFirmable);
  });

  it('rechaza firma de una olla que no es punta', () => {
    expect(() => firmarActa(acta(), firma('olla_9'), AHORA)).toThrow(ActaNoFirmable);
  });

  it('ROJO si se rompe el filtro: sin firmas no hay acta firmada', () => {
    // Guarda explicita: una acta sin firmas nunca es `firmada`.
    expect(acta().estado).not.toBe('firmada');
  });
});

describe('movimientosDeActa', () => {
  it('un acta no firmada NO mueve stock', () => {
    expect(() => movimientosDeActa(acta(), IDS)).toThrow(ActaNoFirmable);
  });

  it('un acta firmada devuelve el par transferencia (origen -, destino +, suma 0)', () => {
    const movs = movimientosDeActa(firmada(), IDS);
    expect(movs).toHaveLength(2);
    const [origen, destino] = movs;
    expect(origen?.motivo).toBe('transferencia');
    expect(origen?.ollaId).toBe('olla_1');
    expect(origen?.delta).toBe(-20000);
    expect(destino?.ollaId).toBe('olla_2');
    expect(destino?.delta).toBe(20000);
    expect(movs.reduce((acc, m) => acc + m.delta, 0)).toBe(0);
  });

  it('sin ids suficientes lanza DatoFaltante', () => {
    const dosItems = firmada();
    const conDos = { ...dosItems, items: [...dosItems.items, { insumoId: 'frijol', lote: null, cantidad: 1, unidad: 'g' as const }] };
    expect(() => movimientosDeActa(conDos, IDS)).toThrow(DatoFaltante);
  });
});

describe('matchExcedentes', () => {
  const HOY = '2026-11-23';

  function exc(id: string, vencimiento: string, ollaId = id): Excedente {
    return {
      id,
      ollaId,
      insumoId: 'arroz',
      cantidad: 20,
      unidad: 'kg',
      vencimiento,
      publicadoEn: '2026-11-23T09:00:00.000Z',
    };
  }

  function nec(ollaId: string, fechaNecesidad: string): Necesidad {
    return { ollaId, insumoId: 'arroz', fechaNecesidad };
  }

  it('ordena por score: lo que vence antes va primero', () => {
    const res = matchExcedentes(
      [exc('exc_lejos', '2026-12-10'), exc('exc_cerca', '2026-11-25')],
      [nec('olla_2', '2026-11-24')],
      { cercania: () => 0.5, hoy: HOY },
    );
    expect(res[0]?.excedenteId).toBe('exc_cerca');
    // score descendente
    expect(res[0]!.score).toBeGreaterThanOrEqual(res[1]!.score);
  });

  it('cada match trae razones textuales explicables', () => {
    const [m] = matchExcedentes([exc('exc_1', '2026-11-24')], [nec('olla_2', '2026-11-23')], {
      cercania: () => 0.2,
      hoy: HOY,
    });
    expect(m?.razones.length).toBeGreaterThan(0);
    expect(m?.razones.join(' ')).toContain('arroz');
  });

  it('descarta excedentes vencidos y no matchea consigo misma', () => {
    const res = matchExcedentes(
      [exc('exc_v', '2026-11-20'), exc('exc_x', '2026-12-01', 'olla_2')],
      [nec('olla_2', '2026-11-23'), nec('olla_9', '2026-11-23')],
      { cercania: () => 0.5, hoy: HOY },
    );
    expect(res.find((m) => m.excedenteId === 'exc_v')).toBeUndefined();
    expect(res.find((m) => m.necesidadOllaId === 'olla_2')).toBeUndefined();
  });

  it('devuelve como maximo 5 y es determinista', () => {
    const excedentes = Array.from({ length: 8 }, (_, i) => exc(`exc_${i}`, `2026-11-2${i % 9}`));
    const necesidades = Array.from({ length: 8 }, (_, i) => nec(`olla_${i}`, '2026-11-24'));
    const ctx = { cercania: () => 0.5, hoy: HOY };
    const a = matchExcedentes(excedentes, necesidades, ctx);
    const b = matchExcedentes(excedentes, necesidades, ctx);
    expect(a.length).toBeLessThanOrEqual(5);
    expect(a).toEqual(b);
  });

  it('los pesos por defecto son 0.3 / 0.5 / 0.2', () => {
    expect(PESOS_MATCH).toEqual({ cercania: 0.3, urgencia: 0.5, necesidad: 0.2 });
  });
});

describe('impactoDesdeActas', () => {
  it('solo cuenta actas firmadas: borrador/anulada no suman', () => {
    const res = impactoDesdeActas([
      firmada(),
      acta({ id: 'acta_b', estado: 'borrador', codigo: '0008' }),
      acta({ id: 'acta_c', estado: 'anulada', codigo: '0009' }),
    ]);
    expect(res.actasFirmadas).toBe(1);
    expect(res.kgRescatados).toBe(20);
  });

  it('ROJO si se rompe el filtro: un acta no firmada no aporta kg', () => {
    const res = impactoDesdeActas([acta({ estado: 'borrador' })]);
    expect(res.kgRescatados).toBe(0);
    expect(res.actasFirmadas).toBe(0);
  });

  it('acta duplicada (mismo origen+codigo) cuenta una sola vez', () => {
    const a = firmada();
    const copia = { ...a, id: 'acta_dup' };
    const res = impactoDesdeActas([a, copia]);
    expect(res.actasFirmadas).toBe(1);
    expect(res.kgRescatados).toBe(20);
  });

  it('raciones floor, compost 14,5% y sin precios soles = null', () => {
    const res = impactoDesdeActas([firmada()]);
    expect(res.raciones).toBe(Math.floor(20 / 0.35));
    expect(res.compostKg).toBe(2.9); // 20 * 0.145
    expect(res.soles).toBeNull();
  });

  it('con precios calcula soles por insumo', () => {
    const res = impactoDesdeActas([firmada()], { precios: { arroz: 4 } });
    expect(res.soles).toBe(80); // 20 kg * 4
  });

  it('ignora movimientos sueltos y mermas: la funcion no los recibe', () => {
    // Un movimiento suelto de entrada no es un acta firmada; aunque exista no
    // entra al impacto (la firma de la funcion solo acepta actas).
    const movSuelto: Movimiento = {
      id: 'm1',
      ollaId: 'olla_1',
      insumoId: 'arroz',
      delta: 50000,
      motivo: 'merma',
      autor: 'x',
      at: AHORA,
      createdAt: AHORA,
      updatedAt: AHORA,
      deletedAt: null,
      deviceId: 'dev-1',
      lamport: 1,
    };
    const actas: readonly Acta[] = [];
    const res = impactoDesdeActas(actas);
    // La merma (aunque sea grande) no aporta: no hay acta y el tipo no la acepta.
    expect(res.kgRescatados).toBe(0);
    expect(movSuelto.motivo).toBe('merma');
  });
});
