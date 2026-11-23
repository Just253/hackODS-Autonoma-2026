import { describe, expect, it } from 'vitest';

import type { Movimiento } from '@hackods/contracts';

import { ErrorDominio } from './errors.js';
import { saldoDespensa } from './racion.js';
import {
  aplicarSustituciones,
  costoDeReceta,
  explotarIngredientes,
  faltantesDeDespensa,
  movimientosDeSalida,
  precioPorUnidadBase,
  sustitucionesParaFaltantes,
  type RecetaProducible,
  type SustitucionAprobada,
} from './recetas.js';

/**
 * Tabla de casos de la cadena receta -> produccion -> descuento -> costo ->
 * faltante. Todo con datos ficticios: ningun precio ni equivalencia real.
 */

/** Las porciones firmadas del seed (supabase/seed.sql, plantilla 301). */
const FIRMADAS = { adulto: 280, menor_5: 180, gestante: 320 } as const;

const GUISO: RecetaProducible = {
  id: 'receta-guiso-lentejas',
  titulo: 'Guiso de lentejas',
  porcionBaseGramos: 280,
  ingredientes: [
    { insumoId: 'lentejas', gramosPorPorcion: 80 },
    { insumoId: 'papa', gramosPorPorcion: 120 },
    { insumoId: 'zanahoria', gramosPorPorcion: 40 },
  ],
};

const SUSTITUCION_LECHE: SustitucionAprobada = {
  id: 'subs-demo-leche-quinua',
  insumoOrigenId: 'leche_evaporada',
  insumoDestinoId: 'quinua',
  factor: 1.2,
  aprobadaPor: 'Nutricionista Demo · CNP-DEMO-0001',
};

function movimiento(
  id: string,
  insumoId: string,
  delta: number,
  extra: Partial<Movimiento> = {},
): Movimiento {
  return {
    id,
    ollaId: 'olla-demo-01',
    insumoId,
    delta,
    motivo: delta < 0 ? 'salida' : 'entrada',
    autor: 'demo-ficticio',
    at: '2026-11-23T10:00:00.000Z',
    createdAt: '2026-11-23T10:00:00.000Z',
    updatedAt: '2026-11-23T10:00:00.000Z',
    deletedAt: null,
    deviceId: 'dispositivo-demo-01',
    lamport: 1,
    ...extra,
  };
}

describe('explotarIngredientes', () => {
  it('multiplica gramos por comensales y aplica el factor de la porcion firmada', () => {
    const explosion = explotarIngredientes(GUISO, { adulto: 3, menor_5: 2 }, FIRMADAS);

    expect(explosion.totalComensales).toBe(5);
    const lentejas = explosion.necesidades.find((n) => n.insumoId === 'lentejas');
    // 80 x 3 x 1 + 80 x 2 x (180/280) = 240 + 102,857 -> 103 con redondeo razonable.
    expect(lentejas?.gramos).toBe(343);
    expect(explosion.necesidades.find((n) => n.insumoId === 'papa')?.gramos).toBe(514);
    expect(explosion.necesidades.find((n) => n.insumoId === 'zanahoria')?.gramos).toBe(171);
  });

  it('declara el origen del factor por grupo: firmada o porcion base', () => {
    const explosion = explotarIngredientes(
      GUISO,
      { adulto: 1, menor_5: 1, adulto_mayor: 1 },
      FIRMADAS,
    );

    const adulto = explosion.porGrupo.find((g) => g.grupo === 'adulto');
    const menor = explosion.porGrupo.find((g) => g.grupo === 'menor_5');
    const mayor = explosion.porGrupo.find((g) => g.grupo === 'adulto_mayor');

    expect(adulto?.origenFactor).toBe('porcion_firmada');
    expect(adulto?.factor).toBe(1);
    expect(menor?.factor).toBeCloseTo(180 / 280, 10);
    // Sin porcion firmada no se inventa un factor: se usa la base y se dice.
    expect(mayor?.factor).toBe(1);
    expect(mayor?.origenFactor).toBe('porcion_base');
    expect(explosion.gruposSinPorcionFirmada).toEqual(['adulto_mayor']);
  });

  it('sin comensales no explota nada', () => {
    const explosion = explotarIngredientes(GUISO, { adulto: 0 }, FIRMADAS);
    expect(explosion.totalComensales).toBe(0);
    expect(explosion.necesidades).toEqual([]);
  });

  it('un ingrediente sin gramos viaja como sin dato, no como cero', () => {
    const explosion = explotarIngredientes(
      { ...GUISO, ingredientes: [{ insumoId: 'sal', gramosPorPorcion: null }] },
      { adulto: 2 },
      FIRMADAS,
    );

    expect(explosion.necesidades).toEqual([]);
    expect(explosion.insumosSinGramos).toEqual(['sal']);
  });

  it('comensales negativos o fraccionarios son un error de dominio', () => {
    expect(() => explotarIngredientes(GUISO, { adulto: -1 }, FIRMADAS)).toThrow(ErrorDominio);
    expect(() => explotarIngredientes(GUISO, { adulto: 1.5 }, FIRMADAS)).toThrow(ErrorDominio);
  });
});

describe('costoDeReceta', () => {
  const necesidades = [
    { insumoId: 'arroz', gramos: 140 },
    { insumoId: 'quinua', gramos: 60 },
    { insumoId: 'papa', gramos: 120 },
  ];

  const precios = {
    arroz: { microPorUnidadBase: 3_350 },
    quinua: { microPorUnidadBase: 9_450 },
    papa: { microPorUnidadBase: 1_620 },
  };

  it('suma gramos por precio por unidad base y divide por racion', () => {
    const costo = costoDeReceta(necesidades, precios, 2);

    // 140 x 3350 + 60 x 9450 + 120 x 1620 = 1 230 400 microcentesimos.
    expect(costo.totalMicro).toBe(1_230_400);
    expect(costo.porRacionMicro).toBe(615_200);
    expect(costo.insumosSinPrecio).toEqual([]);
    expect(costo.lineas.map((l) => l.costoMicro)).toEqual([469_000, 567_000, 194_400]);
  });

  it('si falta un precio el total es sin dato; no se completa con un promedio', () => {
    const costo = costoDeReceta(
      [...necesidades, { insumoId: 'zanahoria', gramos: 80 }],
      precios,
      2,
    );

    expect(costo.totalMicro).toBeNull();
    expect(costo.porRacionMicro).toBeNull();
    expect(costo.insumosSinPrecio).toEqual(['zanahoria']);
    // Lo conocido se informa, pero no se presenta como total.
    expect(costo.totalConocidoMicro).toBe(1_230_400);
    expect(costo.lineas.find((l) => l.insumoId === 'zanahoria')?.costoMicro).toBeNull();
  });

  it('sin raciones no hay costo por racion', () => {
    const costo = costoDeReceta(necesidades, precios, 0);
    expect(costo.totalMicro).toBe(1_230_400);
    expect(costo.porRacionMicro).toBeNull();
  });
});

describe('precioPorUnidadBase', () => {
  it('convierte kg a g sin inventar densidad', () => {
    expect(precioPorUnidadBase(3_350_000, 'kg', 'g', null)).toBe(3_350);
    expect(precioPorUnidadBase(1_620_000, 'kg', 'ml', null)).toBeNull();
    expect(precioPorUnidadBase(5_000_000, 'l', 'ml', null)).toBe(5_000);
  });

  it('usa la equivalencia declarada del insumo para unidad', () => {
    expect(precioPorUnidadBase(8_100_000, 'kg', 'unidad', 50)).toBe(405_000);
    expect(precioPorUnidadBase(550_000, 'unidad', 'unidad', null)).toBe(550_000);
    expect(precioPorUnidadBase(8_100_000, 'kg', 'unidad', null)).toBeNull();
  });
});

describe('faltantesDeDespensa', () => {
  it('compara lo necesario con el stock derivado y solo lista lo que no alcanza', () => {
    const faltantes = faltantesDeDespensa(
      [
        { insumoId: 'lentejas', gramos: 343 },
        { insumoId: 'papa', gramos: 514 },
      ],
      { lentejas: 200, papa: 514 },
    );

    expect(faltantes).toEqual([
      { insumoId: 'lentejas', requerido: 343, disponible: 200, faltan: 143 },
    ]);
  });

  it('un stock negativo cuenta como faltante (nunca se recorta a cero)', () => {
    const faltantes = faltantesDeDespensa([{ insumoId: 'papa', gramos: 100 }], { papa: -50 });
    expect(faltantes[0]?.faltan).toBe(150);
    expect(faltantes[0]?.disponible).toBe(-50);
  });
});

describe('sustituciones', () => {
  it('solo lista las aprobadas para el insumo y no reemplaza nada sola', () => {
    const opciones = sustitucionesParaFaltantes(
      [{ insumoId: 'leche_evaporada', requerido: 120, disponible: 0, faltan: 120 }],
      [SUSTITUCION_LECHE],
    );

    expect(opciones[0]?.estado).toBe('con sustituto');
    expect(opciones[0]?.sustituciones).toEqual([SUSTITUCION_LECHE]);
  });

  it('sin aprobacion dice "sin sustituto" en vez de inventar una equivalencia', () => {
    const opciones = sustitucionesParaFaltantes(
      [{ insumoId: 'sangrecita', requerido: 120, disponible: 100, faltan: 20 }],
      [SUSTITUCION_LECHE],
    );

    expect(opciones[0]?.estado).toBe('sin sustituto');
    expect(opciones[0]?.sustituciones).toEqual([]);
  });

  it('aplica la sustitucion elegida con su factor y suma si el destino ya estaba', () => {
    const resultado = aplicarSustituciones(
      [
        { insumoId: 'quinua', gramos: 45 },
        { insumoId: 'leche_evaporada', gramos: 60 },
      ],
      [SUSTITUCION_LECHE],
    );

    expect(resultado.requerimientos).toEqual([{ insumoId: 'quinua', gramos: 117 }]);
    expect(resultado.aplicadas).toHaveLength(1);
    expect(resultado.aplicadas[0]?.insumoOrigenId).toBe('leche_evaporada');
    expect(resultado.aplicadas[0]?.insumoDestinoId).toBe('quinua');
  });
});

describe('movimientos de salida y saldo derivado', () => {
  it('cada necesidad genera una salida negativa: el stock nunca se escribe', () => {
    expect(
      movimientosDeSalida([
        { insumoId: 'arroz', gramos: 140 },
        { insumoId: 'quinua', gramos: 60 },
      ]),
    ).toEqual([
      { insumoId: 'arroz', delta: -140 },
      { insumoId: 'quinua', delta: -60 },
    ]);
  });

  it('el saldo es la suma de los movimientos, incluidas transferencias y bajas logicas', () => {
    const saldo = saldoDespensa([
      movimiento('m1', 'arroz', 20_000),
      movimiento('m2', 'arroz', -3_000),
      movimiento('m3', 'arroz', 500, { motivo: 'transferencia' }),
      movimiento('m4', 'papa', 5_000),
      movimiento('m5', 'papa', 999, { deletedAt: '2026-11-23T11:00:00.000Z' }),
    ]);

    expect(saldo.arroz).toBe(17_500);
    expect(saldo.papa).toBe(5_000);
  });

  it('producir dos veces descuenta dos veces: no hay saldo mutable que se pise', () => {
    const saldo = saldoDespensa([
      movimiento('e1', 'lentejas', 1_000),
      movimiento('s1', 'lentejas', -343, { motivo: 'salida' }),
      movimiento('s2', 'lentejas', -343, { motivo: 'salida' }),
    ]);

    expect(saldo.lentejas).toBe(314);
  });
});
