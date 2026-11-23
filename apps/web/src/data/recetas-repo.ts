import { movimientoSchema, type Movimiento, type TipoServicio } from '@hackods/contracts';
import {
  ErrorDominio,
  movimientosDeSalida,
  saldoDespensa,
  type ComensalesPorGrupo,
  type CostoRegistrado,
  type RequerimientoInsumo,
  type ServicioDeReceta,
  type SustitucionAplicada,
} from '@hackods/domain';
import type { NuevoEvento } from '@hackods/sync';

import { AUTOR_DEMO, ENTRADAS_DEMO } from '../fixtures/recetas-demo.js';
import { baseDeOlla } from './base.js';
import { siguienteLamport } from './lamport.js';
import { outboxDe } from './outbox-repo.js';
import { DEVICE_DEMO, OLLA_DEMO } from './repositorio.js';

/**
 * Persistencia local del recetario: movimientos append-only y cierre local del
 * servicio cocinado.
 *
 * - El stock NUNCA se guarda: `saldoDespensa` lo deriva de los movimientos
 *   (docs/DECISIONES.md D4).
 * - Producir escribe, en una sola transaccion, una salida por ingrediente y un
 *   evento de outbox por movimiento. Si la transaccion aborta no queda ni
 *   movimiento ni pendiente.
 * - La red no se toca: todo queda en Dexie hasta que `packages/sync` lo envie.
 */

export interface RelojRecetas {
  readonly ahora: () => string;
  /** `eventUuid` inyectable para que los tests sean deterministas. */
  readonly idEvento?: () => string;
}

const relojGlobal: RelojRecetas = {
  ahora: () => new Date().toISOString(),
  idEvento: () => crypto.randomUUID(),
};

function idDeEvento(reloj: RelojRecetas): string {
  return (reloj.idEvento ?? (() => crypto.randomUUID()))();
}

/** Movimientos de UNA olla, en orden estable (no depende del azar de Dexie). */
export async function listarMovimientos(
  ollaId: string = OLLA_DEMO,
): Promise<readonly Movimiento[]> {
  const filas = await baseDeOlla(ollaId).movimientos.where('ollaId').equals(ollaId).toArray();
  return filas.sort((a, b) => {
    if (a.at === b.at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.at < b.at ? -1 : 1;
  });
}

/** Saldo por insumo derivado de los movimientos de la olla. */
export async function stockDeDespensa(
  ollaId: string = OLLA_DEMO,
): Promise<Readonly<Record<string, number>>> {
  return saldoDespensa(await listarMovimientos(ollaId));
}

/**
 * Siembra el stock de demostracion como ENTRADAS, una sola vez por tablet.
 *
 * Ids estables (`entrada-demo-<insumo>`) para que recargar no duplique stock.
 * No pasan por el outbox: son andamiaje de demo, no datos de la olla que deban
 * viajar al servidor. Se marcan con `autor: demo-ficticio`.
 */
export async function asegurarEntradasDemo(
  reloj: RelojRecetas = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<void> {
  const base = baseDeOlla(ollaId);
  const ahora = reloj.ahora();

  await base.transaction('rw', base.movimientos, base.meta, async () => {
    for (const entrada of ENTRADAS_DEMO) {
      const id = `entrada-demo-${entrada.insumoId}`;
      if ((await base.movimientos.get(id)) !== undefined) continue;
      const lamport = await siguienteLamport(base);
      const movimiento = movimientoSchema.parse({
        id,
        ollaId,
        insumoId: entrada.insumoId,
        delta: entrada.gramos,
        motivo: 'entrada',
        autor: AUTOR_DEMO,
        at: ahora,
        createdAt: ahora,
        updatedAt: ahora,
        deletedAt: null,
        deviceId: DEVICE_DEMO,
        lamport,
      });
      await base.movimientos.add(movimiento);
    }
  });
}

export interface EntradaProduccion {
  readonly recetaId: string;
  readonly recetaTitulo: string;
  readonly tipo: TipoServicio;
  readonly comensalesPorGrupo: ComensalesPorGrupo;
  readonly totalComensales: number;
  readonly cocinero: string;
  readonly rolCocinero: string;
  readonly cocidoA75C: boolean;
  readonly costo: CostoRegistrado;
  readonly sustituciones: readonly SustitucionAplicada[];
  /** Ya con las sustituciones elegidas aplicadas. */
  readonly requerimientos: readonly RequerimientoInsumo[];
}

export interface ProduccionGuardada {
  readonly servicio: ServicioDeReceta;
  readonly movimientos: readonly Movimiento[];
}

/**
 * Cierra el servicio: una salida por ingrediente, el registro del servicio y
 * un evento de outbox por movimiento, todo en la misma transaccion.
 *
 * El 75 °C es requisito de inocuidad (D6): sin el checklist no se registra.
 */
export async function producirServicio(
  entrada: EntradaProduccion,
  reloj: RelojRecetas = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<ProduccionGuardada> {
  if (!entrada.cocidoA75C) {
    throw new ErrorDominio('no se registra un servicio sin confirmar la cocción a 75 °C');
  }
  const salidas = movimientosDeSalida(entrada.requerimientos);
  if (salidas.length === 0) {
    throw new ErrorDominio('no hay ingredientes que descontar: revisá los comensales');
  }
  if (entrada.totalComensales <= 0) {
    throw new ErrorDominio('un servicio sin comensales no descuenta despensa');
  }

  const base = baseDeOlla(ollaId);
  const ahora = reloj.ahora();
  const fecha = ahora.slice(0, 10);
  const servicioId = `servicio-receta-${fecha}-${idDeEvento(reloj)}`;
  const eventos: NuevoEvento[] = [];

  const resultado = await base.transaction(
    'rw',
    base.movimientos,
    base.serviciosCocidos,
    base.meta,
    base.outbox,
    async () => {
      const movimientos: Movimiento[] = [];

      for (const salida of salidas) {
        const lamport = await siguienteLamport(base);
        const eventUuid = idDeEvento(reloj);
        const movimiento = movimientoSchema.parse({
          id: `mov-${eventUuid}`,
          ollaId,
          insumoId: salida.insumoId,
          delta: salida.delta,
          motivo: 'salida',
          // Auditoria: quien cocino y cuando (sin PII, D2).
          autor: entrada.cocinero,
          at: ahora,
          createdAt: ahora,
          updatedAt: ahora,
          deletedAt: null,
          deviceId: DEVICE_DEMO,
          lamport,
        });
        await base.movimientos.add(movimiento);
        movimientos.push(movimiento);

        const lamportEvento = await siguienteLamport(base);
        eventos.push({
          eventUuid,
          idempotencyKey: eventUuid,
          lamport: lamportEvento,
          deviceId: DEVICE_DEMO,
          ollaId,
          entidad: 'movimientos',
          op: 'upsert',
          payload: movimiento,
          creadoEn: ahora,
        });
      }

      const servicio: ServicioDeReceta = {
        id: servicioId,
        ollaId,
        fecha,
        recetaId: entrada.recetaId,
        recetaTitulo: entrada.recetaTitulo,
        tipo: entrada.tipo,
        comensalesPorGrupo: entrada.comensalesPorGrupo,
        totalComensales: entrada.totalComensales,
        cocinero: entrada.cocinero,
        rolCocinero: entrada.rolCocinero,
        cocidoA75C: entrada.cocidoA75C,
        costo: entrada.costo,
        sustituciones: entrada.sustituciones,
        movimientosIds: movimientos.map((movimiento) => movimiento.id),
        createdAt: ahora,
      };
      await base.serviciosCocidos.add(servicio);

      for (const evento of eventos) {
        await outboxDe(base).encolarEnTransaccion(evento, base.outbox);
      }

      return { servicio, movimientos };
    },
  );

  // La transaccion confirmo: recien ahora el badge puede contar los pendientes.
  for (const evento of eventos) outboxDe(base).registrarConfirmado(evento);

  return resultado;
}

/** Ultimos servicios de la olla, del mas nuevo al mas viejo. */
export async function listarServicios(
  ollaId: string = OLLA_DEMO,
  limite = 5,
): Promise<readonly ServicioDeReceta[]> {
  const filas = await baseDeOlla(ollaId).serviciosCocidos.where('ollaId').equals(ollaId).toArray();
  return filas
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return a.id < b.id ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limite);
}
