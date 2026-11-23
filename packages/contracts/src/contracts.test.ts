import { describe, expect, it } from 'vitest';

import { personaSchema, solicitudSchema, type Persona } from './domain.js';

const personaValida: Persona = {
  id: 'p_demo_01',
  ollaId: 'olla_demo',
  alias: 'Persona Demo 01',
  anioNacimiento: 1990,
  categoria: 'adulto',
  anemia: 'sin_dato',
  pesoKg: null,
  notas: null,
  createdAt: '2026-11-23T10:00:00Z',
  updatedAt: '2026-11-23T10:00:00Z',
  deletedAt: null,
  deviceId: 'device_demo',
};

describe('contracts v1', () => {
  it('valida una persona con los campos minimos', () => {
    expect(personaSchema.parse(personaValida)).toEqual(personaValida);
  });

  it('rechaza una categoria fuera del enum', () => {
    const invalida = { ...personaValida, categoria: 'anciano' };
    expect(personaSchema.safeParse(invalida).success).toBe(false);
  });

  it('exige items en una solicitud entre ollas', () => {
    const base = {
      id: 's_01',
      ollaOrigenId: 'olla_a',
      ollaDestinoId: 'olla_b',
      estado: 'borrador',
      items: [{ insumoId: 'arroz', cantidad: 2, unidad: 'kg', nota: null }],
      createdAt: '2026-11-23T10:00:00Z',
      updatedAt: '2026-11-23T10:00:00Z',
      deletedAt: null,
      deviceId: 'device_demo',
    };
    expect(solicitudSchema.parse(base).estado).toBe('borrador');
    expect(solicitudSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(solicitudSchema.safeParse({ ...base, items: [{ insumoId: 'arroz' }] }).success).toBe(
      false,
    );
  });
});
