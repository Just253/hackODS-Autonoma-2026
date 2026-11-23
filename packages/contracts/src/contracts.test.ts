import { describe, expect, it } from 'vitest';

import {
  identidadLocalSchema,
  personaSchema,
  precioSchema,
  solicitudSchema,
  type Persona,
} from './domain.js';

const personaValida: Persona = {
  codigoP: 'P-0001',
  ollaId: 'olla_demo',
  anioNacimiento: 1990,
  sexo: 'F',
  categoria: 'adulto',
  anemia: 'sin_dato',
  pesoKg: null,
  tallaCm: null,
  consentimientoSeguimiento: false,
  notas: null,
  createdAt: '2026-11-23T10:00:00Z',
  updatedAt: '2026-11-23T10:00:00Z',
  deletedAt: null,
  deviceId: 'device_demo',
  lamport: 1,
};

describe('contracts v1', () => {
  it('valida una persona con codigo P-XXXX y sin identidad', () => {
    const parseada = personaSchema.parse(personaValida);
    expect(parseada.codigoP).toBe('P-0001');
    expect(Object.keys(parseada)).not.toContain('nombreLocal');
  });

  it('rechaza un codigo que no es P-XXXX', () => {
    expect(personaSchema.safeParse({ ...personaValida, codigoP: 'P-1' }).success).toBe(false);
    expect(personaSchema.safeParse({ ...personaValida, codigoP: 'X-0001' }).success).toBe(false);
  });

  it('la identidad local es localOnly y nunca una entidad sincronizable', () => {
    const local = identidadLocalSchema.parse({
      localOnly: true,
      codigoP: 'P-0001',
      nombreLocal: 'Como le dicen en la olla',
      alias: 'P-0001',
      actualizadoEn: '2026-11-23T10:00:00Z',
    });
    expect(local.localOnly).toBe(true);
    expect(identidadLocalSchema.safeParse({ ...local, localOnly: false }).success).toBe(false);
  });

  it('exige fecha, canal y fuente en un precio', () => {
    const base = {
      id: 'pr_01',
      insumoId: 'arroz',
      canal: 'mayorista',
      unidad: 'g',
      precio: 4.2,
      fecha: '2026-11-23',
      fuente: 'visit_data_demo',
      url: null,
    };
    expect(precioSchema.parse(base).canal).toBe('mayorista');
    expect(precioSchema.safeParse({ ...base, fecha: '23/11/2026' }).success).toBe(false);
    expect(precioSchema.safeParse({ ...base, fuente: undefined }).success).toBe(false);
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
      lamport: 1,
    };
    expect(solicitudSchema.parse(base).estado).toBe('borrador');
    expect(solicitudSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(solicitudSchema.safeParse({ ...base, items: [{ insumoId: 'arroz' }] }).success).toBe(
      false,
    );
  });
});
