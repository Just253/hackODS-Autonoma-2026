import { describe, expect, it } from 'vitest';

import { clienteFalso } from '../test/cliente-falso.js';
import {
  listarOllas,
  listarPersonas,
  membresiaDelUsuario,
  seriePrecios,
  sinPrefijoOlla,
  ultimosMovimientos,
} from './remoto.js';

/**
 * Queries de lectura. Sin red: el cliente se inyecta. Lo que se prueba es el
 * mapeo, el filtro por olla, las columnas pedidas y que un error no se convierta
 * en datos inventados.
 */

const OLLA = '00000000-0000-4000-8000-000000000001';

describe('listarPersonas', () => {
  it('devuelve codigo y categoria de la olla y NO pide columnas de salud', async () => {
    const { cliente, consultas } = clienteFalso({
      personas: [
        { codigo_p: 'P-0001', categoria: 'gestante', olla_id: OLLA },
        { codigo_p: 'P-0002', categoria: 'adulto_mayor', olla_id: OLLA },
        { codigo_p: 'P-0003', categoria: 'adulto', olla_id: 'otra-olla' },
      ],
    });

    const resultado = await listarPersonas(OLLA, cliente);

    expect(resultado).toEqual({
      ok: true,
      datos: [
        { codigoP: 'P-0001', categoria: 'gestante', ollaId: OLLA },
        { codigoP: 'P-0002', categoria: 'adulto_mayor', ollaId: OLLA },
      ],
    });

    const consulta = consultas[0];
    expect(consulta?.tabla).toBe('personas');
    expect(consulta?.columnas).toBe('codigo_p, categoria, olla_id');
    // Sin salud ni identidad: la columna no aparece en el SELECT.
    for (const prohibida of ['peso', 'talla', 'anemia', 'notas', 'consentimiento']) {
      expect(consulta?.columnas).not.toContain(prohibida);
    }
    expect(consulta?.filtros).toEqual([['olla_id', OLLA]]);
    expect(consulta?.orden).toBe('codigo_p');
  });

  it('un error de RLS/red es un fallo, no una lista vacia silenciosa', async () => {
    const { cliente } = clienteFalso({ personas: { error: 'permission denied' } });

    const resultado = await listarPersonas(OLLA, cliente);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.motivo).toBe('error');
      expect(resultado.mensaje).toBe('permission denied');
    }
  });

  it('sin cliente configurado dice sin_configurar (no error de red)', async () => {
    const resultado = await listarPersonas(OLLA, null);

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toBe('sin_configurar');
  });
});

describe('listarOllas', () => {
  it('mapea id, titulo y distrito', async () => {
    const { cliente } = clienteFalso({
      ollas: [{ id: OLLA, titulo: 'Olla Demo Ate', distrito: 'Ate' }],
    });

    expect(await listarOllas(cliente)).toEqual({
      ok: true,
      datos: [{ id: OLLA, titulo: 'Olla Demo Ate', distrito: 'Ate' }],
    });
  });
});

describe('seriePrecios', () => {
  it('cruza precios con insumos y conserva canal, unidad y fecha', async () => {
    const { cliente, consultas } = clienteFalso({
      precios: [
        {
          olla_id: OLLA,
          insumo_id: 'arroz',
          canal: 'mayorista',
          unidad: 'g',
          precio: 420000,
          fecha: '2026-11-01',
        },
      ],
      insumos: [{ id: 'arroz', denominacion: 'Arroz demo', olla_id: OLLA }],
    });

    expect(await seriePrecios(OLLA, cliente)).toEqual({
      ok: true,
      datos: [
        {
          insumoId: 'arroz',
          insumo: 'Arroz demo',
          canal: 'mayorista',
          unidad: 'g',
          precio: 420000,
          fecha: '2026-11-01',
        },
      ],
    });
    expect(consultas.map((c) => c.tabla)).toEqual(['precios', 'insumos']);
  });

  it('si falta la fila de insumos, usa el id (dato real, no un nombre inventado)', async () => {
    const { cliente } = clienteFalso({
      precios: [
        {
          olla_id: OLLA,
          insumo_id: 'papa',
          canal: 'minorista',
          unidad: 'g',
          precio: 230000,
          fecha: '2026-11-01',
        },
      ],
      insumos: [],
    });

    const resultado = await seriePrecios(OLLA, cliente);

    expect(resultado.ok && resultado.datos[0]?.insumo).toBe('papa');
  });

  it('acepta precio como texto (numeric de PostgREST) sin romper', async () => {
    const { cliente } = clienteFalso({
      precios: [
        {
          olla_id: OLLA,
          insumo_id: 'arroz',
          canal: 'mayorista',
          unidad: 'g',
          precio: '420000.00',
          fecha: '2026-11-01',
        },
      ],
      insumos: [{ id: 'arroz', denominacion: 'Arroz demo' }],
    });

    const resultado = await seriePrecios(OLLA, cliente);

    expect(resultado.ok && resultado.datos[0]?.precio).toBe(420000);
  });
});

describe('ultimosMovimientos', () => {
  it('pide los ultimos 20 del mas nuevo al mas viejo y resuelve el insumo', async () => {
    const { cliente, consultas } = clienteFalso({
      movimientos: [
        {
          olla_id: OLLA,
          insumo_id: 'arroz',
          delta: -500,
          motivo: 'salida',
          at: '2026-11-02T10:00:00.000Z',
        },
      ],
      insumos: [{ id: 'arroz', denominacion: 'Arroz demo', olla_id: OLLA }],
    });

    const resultado = await ultimosMovimientos(OLLA, cliente);

    expect(resultado).toEqual({
      ok: true,
      datos: [
        {
          insumoId: 'arroz',
          insumo: 'Arroz demo',
          delta: -500,
          motivo: 'salida',
          at: '2026-11-02T10:00:00.000Z',
        },
      ],
    });
    expect(consultas[0]?.tabla).toBe('movimientos');
    expect(consultas[0]?.limite).toBe(20);
    expect(consultas[0]?.orden).toBe('at');
  });
});

describe('membresiaDelUsuario', () => {
  it('resuelve member -> olla y quita el prefijo "Olla" del titulo', async () => {
    const { cliente, consultas } = clienteFalso({
      devices: [{ member_id: 'member-1' }],
      olla_members: [{ member_id: 'member-1', olla_id: OLLA, rol: 'organizadora' }],
      ollas: [{ id: OLLA, titulo: 'Olla Demo Ate', distrito: 'Ate' }],
    });

    expect(await membresiaDelUsuario(cliente)).toEqual({
      memberId: 'member-1',
      ollaId: OLLA,
      nombreOlla: 'Demo Ate',
      rol: 'organizadora',
    });
    expect(consultas.map((c) => c.tabla)).toEqual(['devices', 'olla_members', 'ollas']);
  });

  it('un usuario sin device no tiene sesion de olla (no se adivina un rol)', async () => {
    const { cliente } = clienteFalso({ devices: [] });

    expect(await membresiaDelUsuario(cliente)).toBeNull();
  });

  it('un rol desconocido no entra: la sesion queda sin olla', async () => {
    const { cliente } = clienteFalso({
      devices: [{ member_id: 'member-1' }],
      olla_members: [{ member_id: 'member-1', olla_id: OLLA, rol: 'superadmin' }],
      ollas: [{ id: OLLA, titulo: 'Olla Demo Ate', distrito: 'Ate' }],
    });

    expect(await membresiaDelUsuario(cliente)).toBeNull();
  });
});

describe('sinPrefijoOlla', () => {
  it('saca solo el prefijo que agrega el divisor', () => {
    expect(sinPrefijoOlla('Olla Demo Ate')).toBe('Demo Ate');
    expect(sinPrefijoOlla('Comedor Demo Comas')).toBe('Comedor Demo Comas');
  });
});
