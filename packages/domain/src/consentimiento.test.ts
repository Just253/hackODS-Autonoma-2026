import { describe, expect, it } from 'vitest';

import {
  CONSENTIMIENTO_VERSION,
  ConsentimientoInvalido,
  estaVigente,
  estadoConsentimiento,
  otorgar,
  revocar,
  ultimoRegistro,
  type RegistroConsentimiento,
} from './consentimiento.js';

/**
 * Regla de consentimiento (#74): dos permisos separados, append-only y
 * "la última firma gana" (otorgar y revocar son filas nuevas, nunca un UPDATE).
 *
 * Tabla de casos por regla (válido, límite, inválido), reloj e ids inyectados:
 * ninguna función de este archivo llama a `Date.now()` ni a `crypto`.
 */

const DATOS = {
  id: '00000000-0000-4000-8000-000000000001',
  personaId: 'P-AAAA',
  tipo: 'seguimiento',
  firmadoEn: '2026-11-23T10:00:00.000Z',
  deviceId: 'dispositivo-demo-01',
  lamport: 1,
} as const;

function registro(over: Partial<RegistroConsentimiento> = {}): RegistroConsentimiento {
  return {
    id: 'r-1',
    personaId: 'P-AAAA',
    tipo: 'seguimiento',
    otorgado: true,
    version: CONSENTIMIENTO_VERSION,
    firmadoEn: '2026-11-23T10:00:00.000Z',
    revocadoEn: null,
    deviceId: 'dispositivo-demo-01',
    lamport: 1,
    ...over,
  };
}

describe('otorgar', () => {
  it('crea la fila con el sello del contrato y sin fecha de revocación', () => {
    const fila = otorgar({ ...DATOS, tipo: 'seguimiento' });

    expect(fila).toEqual({
      id: DATOS.id,
      personaId: 'P-AAAA',
      tipo: 'seguimiento',
      otorgado: true,
      version: CONSENTIMIENTO_VERSION,
      firmadoEn: DATOS.firmadoEn,
      revocadoEn: null,
      deviceId: DATOS.deviceId,
      lamport: 1,
    });
  });

  it('los dos permisos son independientes: otorgar uno no toca el otro', () => {
    const seguimiento = otorgar({ ...DATOS, tipo: 'seguimiento' });
    const estadisticas = otorgar({ ...DATOS, id: 'r-2', tipo: 'estadisticas' });

    expect(estadoConsentimiento([seguimiento], 'seguimiento')).toBe('otorgado');
    expect(estadoConsentimiento([seguimiento], 'estadisticas')).toBe('sin_registro');
    expect(estadoConsentimiento([estadisticas], 'estadisticas')).toBe('otorgado');
  });

  it('acepta lamport 0 (límite inferior) y rechaza uno negativo', () => {
    expect(otorgar({ ...DATOS, lamport: 0 }).lamport).toBe(0);
    expect(() => otorgar({ ...DATOS, lamport: -1 })).toThrow(ConsentimientoInvalido);
  });

  it('rechaza una versión menor a 1 y una fecha sin zona horaria', () => {
    expect(() => otorgar({ ...DATOS, version: 0 })).toThrow(ConsentimientoInvalido);
    expect(() => otorgar({ ...DATOS, firmadoEn: '2026-11-23T10:00:00' })).toThrow(
      ConsentimientoInvalido,
    );
  });

  it('rechaza id, persona o dispositivo vacíos', () => {
    expect(() => otorgar({ ...DATOS, id: '  ' })).toThrow(ConsentimientoInvalido);
    expect(() => otorgar({ ...DATOS, personaId: '' })).toThrow(ConsentimientoInvalido);
    expect(() => otorgar({ ...DATOS, deviceId: '' })).toThrow(ConsentimientoInvalido);
  });
});

describe('revocar', () => {
  it('es una fila nueva: otorgado=false y revocadoEn = firmadoEn', () => {
    const fila = revocar({ ...DATOS, id: 'r-2', lamport: 2, tipo: 'seguimiento' });

    expect(fila.otorgado).toBe(false);
    expect(fila.revocadoEn).toBe(fila.firmadoEn);
  });

  it('revocar sin registro previo también queda como revocado explícito', () => {
    const fila = revocar({ ...DATOS, tipo: 'estadisticas' });

    expect(estadoConsentimiento([fila], 'estadisticas')).toBe('revocado');
  });

  it('la última firma gana: revocar después de otorgar deja el permiso cortado', () => {
    const otorgado = registro({ id: 'r-1', lamport: 1 });
    const revocado = registro({ id: 'r-2', lamport: 2, otorgado: false, revocadoEn: '2026-11-23T11:00:00.000Z' });

    expect(estadoConsentimiento([otorgado, revocado], 'seguimiento')).toBe('revocado');
    expect(estaVigente([otorgado, revocado], 'seguimiento')).toBe(false);
  });

  it('volver a otorgar después de revocar sí devuelve el permiso', () => {
    const otorgado = registro({ id: 'r-1', lamport: 1 });
    const revocado = registro({ id: 'r-2', lamport: 2, otorgado: false, revocadoEn: '2026-11-23T11:00:00.000Z' });
    const otraVez = registro({ id: 'r-3', lamport: 3, firmadoEn: '2026-11-23T12:00:00.000Z' });

    expect(estadoConsentimiento([revocado, otraVez, otorgado], 'seguimiento')).toBe('otorgado');
  });

  it('una revocación vieja no pisa una firma más nueva (no se ordena por llegada)', () => {
    const vieja = registro({ id: 'r-1', lamport: 1, otorgado: false, revocadoEn: '2026-11-23T10:00:00.000Z' });
    const nueva = registro({ id: 'r-2', lamport: 9, firmadoEn: '2026-11-23T12:00:00.000Z' });

    expect(estadoConsentimiento([vieja, nueva], 'seguimiento')).toBe('otorgado');
  });
});

describe('orden y desempates', () => {
  it('sin registros el estado es sin_registro, nunca "otorgado" por defecto', () => {
    expect(estadoConsentimiento([], 'seguimiento')).toBe('sin_registro');
    expect(estaVigente([], 'estadisticas')).toBe(false);
    expect(ultimoRegistro([], 'seguimiento')).toBeNull();
  });

  it('filtra por tipo: la firma de estadísticas no cuenta como seguimiento', () => {
    const estadisticas = registro({ id: 'r-1', tipo: 'estadisticas' });

    expect(estadoConsentimiento([estadisticas], 'seguimiento')).toBe('sin_registro');
    expect(estadoConsentimiento([estadisticas], 'estadisticas')).toBe('otorgado');
  });

  it('con el mismo lamport desempata por dispositivo, no por orden del arreglo', () => {
    const delA = registro({ id: 'r-a', lamport: 5, deviceId: 'dispositivo-a', otorgado: true });
    const delB = registro({
      id: 'r-b',
      lamport: 5,
      deviceId: 'dispositivo-b',
      otorgado: false,
      revocadoEn: '2026-11-23T10:00:00.000Z',
    });

    expect(estadoConsentimiento([delA, delB], 'seguimiento')).toBe('revocado');
    expect(estadoConsentimiento([delB, delA], 'seguimiento')).toBe('revocado');
  });

  it('no muta el arreglo que recibe', () => {
    const registros = [registro({ id: 'r-2', lamport: 2 }), registro({ id: 'r-1', lamport: 1 })];
    const copia = [...registros];

    estadoConsentimiento(registros, 'seguimiento');

    expect(registros).toEqual(copia);
  });
});
