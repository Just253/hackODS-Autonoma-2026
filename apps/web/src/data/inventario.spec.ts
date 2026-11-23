import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Insumo } from '@hackods/contracts';
import { insumoSchema } from '@hackods/contracts';

import { baseDeOlla, cerrarBases } from './base.js';
import * as inventario from './inventario.js';
import {
  InsumoNoEncontrado,
  MovimientoInvalido,
  listarInsumos,
  listarLotes,
  listarMovimientos,
  registrarMovimiento,
  sembrarInsumos,
} from './inventario.js';
import { outboxDe } from './outbox-repo.js';
import { DEVICE_DEMO, OLLA_DEMO } from './repositorio.js';

/**
 * Despensa local (issue #69) con IndexedDB falsa y la red apagada
 * (`src/test/setup.ts`): si una escritura necesitara red, el test falla.
 *
 * Lo que se prueba:
 * - el stock se DERIVA de los movimientos (no hay saldo guardado);
 * - append-only: cada alta agrega una fila y no existe API para editar ni borrar;
 * - el alta encola el movimiento en el outbox en la misma transaccion;
 * - el lote (vencimiento) queda en el dispositivo y no viaja al servidor.
 */

const RELOJ = {
  ahora: () => '2026-11-23T10:00:00.000Z',
  azar: () => 0.1,
  idEvento: (() => {
    let n = 0;
    return () => {
      n += 1;
      return `0000000${n}-0000-4000-8000-000000000000`.slice(0, 36);
    };
  })(),
} as const;

/** Catalogo minimo y explicito: el test no depende del fixture de la demo. */
const ARROZ: Insumo = {
  id: 'arroz',
  denominacion: 'arroz',
  unidadBase: 'g',
  gramosPorUnidad: null,
  stockMinimo: 5000,
  perecedero: false,
  alergenos: [],
};

const POLLO: Insumo = {
  id: 'pollo',
  denominacion: 'pollo',
  unidadBase: 'g',
  gramosPorUnidad: null,
  stockMinimo: 3000,
  perecedero: true,
  alergenos: [],
};

function borrarBase(): Promise<void> {
  cerrarBases();
  return new Promise<void>((listo, falla) => {
    const pedido = indexedDB.deleteDatabase(`hackods-${OLLA_DEMO}`);
    pedido.onsuccess = () => listo();
    pedido.onerror = () => falla(pedido.error ?? new Error('no se pudo borrar la base'));
    pedido.onblocked = () => falla(new Error('borrado bloqueado: conexion abierta'));
  });
}

beforeEach(async () => {
  await borrarBase();
  await sembrarInsumos([ARROZ, POLLO], OLLA_DEMO);
});

afterEach(async () => {
  await borrarBase();
});

describe('sembrarInsumos: catalogo idempotente', () => {
  it('sembrar dos veces no duplica y no pisa un minimo ya corregido', async () => {
    const primeraVez = await sembrarInsumos([ARROZ, POLLO], OLLA_DEMO);
    expect(primeraVez).toBe(0);

    // Alguien corrigio el minimo a mano en este dispositivo.
    const base = baseDeOlla(OLLA_DEMO);
    await base.insumos.put({ ...ARROZ, stockMinimo: 8000 });

    const segundaVez = await sembrarInsumos([ARROZ, POLLO], OLLA_DEMO);
    expect(segundaVez).toBe(0);
    expect(await base.insumos.count()).toBe(2);
    expect((await base.insumos.get('arroz'))?.stockMinimo).toBe(8000);
  });

  it('el catalogo ya guardado se lista ordenado por denominacion', async () => {
    const denominaciones = (await listarInsumos(OLLA_DEMO)).map((i) => i.denominacion);
    expect(denominaciones).toEqual(['arroz', 'pollo']);
  });
});

describe('registrarMovimiento: append-only y stock derivado', () => {
  it('el stock es la suma de los movimientos, no un saldo guardado', async () => {
    await registrarMovimiento(
      { insumoId: 'arroz', delta: 5000, motivo: 'entrada', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );
    await registrarMovimiento(
      { insumoId: 'arroz', delta: -1500, motivo: 'salida', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );

    const movimientos = await listarMovimientos(OLLA_DEMO);
    expect(movimientos).toHaveLength(2);
    const suma = movimientos.reduce((total, m) => total + m.delta, 0);
    expect(suma).toBe(3500);
    // Ninguna fila lleva un saldo: si alguien guardara uno, esta clave apareceria.
    for (const movimiento of movimientos) {
      expect(movimiento).not.toHaveProperty('saldo');
    }
  });

  it('dos entradas del mismo insumo son dos filas, nunca una pisada', async () => {
    await registrarMovimiento(
      { insumoId: 'arroz', delta: 2000, motivo: 'entrada', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );
    await registrarMovimiento(
      { insumoId: 'arroz', delta: 3000, motivo: 'entrada', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );

    const movimientos = await listarMovimientos(OLLA_DEMO);
    expect(movimientos.map((m) => m.delta)).toEqual([2000, 3000]);
    expect(new Set(movimientos.map((m) => m.id)).size).toBe(2);
  });

  it('no expone ninguna forma de editar ni borrar un movimiento', () => {
    const nombres = Object.keys(inventario);
    const mutadores = nombres.filter((nombre) => /actualiz|editar|borrar|eliminar|update|delete/i.test(nombre));
    expect(mutadores).toEqual([]);
  });

  it('rechaza un delta de cero: un movimiento que no mueve nada no es un dato', async () => {
    await expect(
      registrarMovimiento(
        { insumoId: 'arroz', delta: 0, motivo: 'ajuste', autor: 'cocinera' },
        RELOJ,
        OLLA_DEMO,
      ),
    ).rejects.toThrow(MovimientoInvalido);
    expect(await listarMovimientos(OLLA_DEMO)).toHaveLength(0);
  });

  it('rechaza el signo que no corresponde al motivo', async () => {
    await expect(
      registrarMovimiento(
        { insumoId: 'arroz', delta: -100, motivo: 'entrada', autor: 'cocinera' },
        RELOJ,
        OLLA_DEMO,
      ),
    ).rejects.toThrow(MovimientoInvalido);
    await expect(
      registrarMovimiento(
        { insumoId: 'arroz', delta: 100, motivo: 'salida', autor: 'cocinera' },
        RELOJ,
        OLLA_DEMO,
      ),
    ).rejects.toThrow(MovimientoInvalido);
  });

  it('rechaza un insumo que no esta en el catalogo en vez de inventarlo', async () => {
    await expect(
      registrarMovimiento(
        { insumoId: 'caviar', delta: 10, motivo: 'entrada', autor: 'cocinera' },
        RELOJ,
        OLLA_DEMO,
      ),
    ).rejects.toThrow(InsumoNoEncontrado);
  });

  it('redondea a dos decimales, la precision de la columna de la base', async () => {
    const movimiento = await registrarMovimiento(
      { insumoId: 'arroz', delta: 453.592, motivo: 'entrada', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );
    expect(movimiento.delta).toBe(453.59);
  });
});

describe('outbox: el movimiento viaja, el lote no', () => {
  it('encola la entrada en la misma transaccion con el payload del contrato', async () => {
    const movimiento = await registrarMovimiento(
      { insumoId: 'arroz', delta: 5000, motivo: 'entrada', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    const [evento] = outbox.pendientes();

    expect(evento?.entidad).toBe('movimientos');
    expect(evento?.op).toBe('upsert');
    expect(evento?.eventUuid).toBe(evento?.idempotencyKey);
    // `loteId` es un vinculo local: el contrato `Movimiento` no lo modela.
    expect(evento?.payload).not.toHaveProperty('loteId');
    expect(evento?.payload).toMatchObject({
      id: movimiento.id,
      insumoId: 'arroz',
      delta: 5000,
      motivo: 'entrada',
      autor: 'cocinera',
    });
  });

  it('una entrada con vencimiento abre un lote en Dexie y no lo manda al servidor', async () => {
    const movimiento = await registrarMovimiento(
      {
        insumoId: 'pollo',
        delta: 3000,
        motivo: 'entrada',
        autor: 'cocinera',
        nuevoLote: { fechaVencimiento: '2026-11-30' },
      },
      RELOJ,
      OLLA_DEMO,
    );

    const lotes = await listarLotes(OLLA_DEMO);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toMatchObject({
      loteId: movimiento.loteId,
      insumoId: 'pollo',
      cantidadInicial: 3000,
      fechaVencimiento: '2026-11-30',
      estado: 'disponible',
    });

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    expect(outbox.pendientes()).toHaveLength(1);
    expect(JSON.stringify(outbox.pendientes()[0]?.payload)).not.toContain('2026-11-30');
  });

  it('una salida con lote existente lo deja vinculado y no crea otro lote', async () => {
    const entrada = await registrarMovimiento(
      {
        insumoId: 'pollo',
        delta: 3000,
        motivo: 'entrada',
        autor: 'cocinera',
        nuevoLote: { fechaVencimiento: '2026-11-30' },
      },
      RELOJ,
      OLLA_DEMO,
    );

    const salida = await registrarMovimiento(
      {
        insumoId: 'pollo',
        delta: -1000,
        motivo: 'salida',
        autor: 'cocinera',
        loteId: entrada.loteId,
      },
      RELOJ,
      OLLA_DEMO,
    );

    expect(salida.loteId).toBe(entrada.loteId);
    expect(await listarLotes(OLLA_DEMO)).toHaveLength(1);
    expect(await listarMovimientos(OLLA_DEMO)).toHaveLength(2);
  });
});

describe('sin red no rompe', () => {
  it('escribe y lee de este dispositivo con la red apagada', async () => {
    // `src/test/setup.ts` deja `fetch` tirando: si algo quisiera salir a la
    // red, este caso falla con "la red esta apagada".
    await registrarMovimiento(
      { insumoId: 'arroz', delta: 1000, motivo: 'entrada', autor: 'cocinera' },
      RELOJ,
      OLLA_DEMO,
    );

    expect(await listarMovimientos(OLLA_DEMO)).toHaveLength(1);
    expect(await listarInsumos(OLLA_DEMO)).toHaveLength(2);
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    expect(outbox.total()).toBe(1);
    expect(DEVICE_DEMO).toBe('dispositivo-demo-01');
  });
});

describe('catalogo del fixture de la demo', () => {
  it('todos los insumos de la demo pasan el contrato', async () => {
    const { INSUMOS_DEMO } = await import('../fixtures/inventario-demo.js');
    expect(INSUMOS_DEMO.length).toBeGreaterThan(0);
    for (const insumo of INSUMOS_DEMO) {
      expect(insumoSchema.safeParse(insumo).success, insumo.id).toBe(true);
    }
  });
});
