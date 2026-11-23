/**
 * Solicitudes entre ollas: la peticion y sus transiciones.
 *
 * Estados del dominio (issue #18 / CU-07): `borrador -> enviada -> aceptada ->
 * entregada`, y `borrador | enviada | aceptada -> cancelada`. `entregada` es
 * terminal. **Ningun salto de estado es valido**: el intento devuelve
 * `TransicionInvalida` con el estado actual y el pedido.
 *
 * Una solicitud NUNCA mueve stock por si sola. `resolverSolicitud(entregar)`
 * *genera* la transferencia append-only y la devuelve; quien la escribe es la
 * despensa. Una transferencia son **dos** movimientos con signo opuesto (origen
 * negativo, destino positivo) para que el sistema no cree ni destruya stock: la
 * suma de sus deltas es 0. El saldo siempre se deriva de los movimientos.
 *
 * Determinista: no lee el reloj. El instante llega por parametro.
 */
import type { EstadoSolicitud, Movimiento, SolicitudItem } from '@hackods/contracts';

import { DatoFaltante, TransicionInvalida, UnidadNoSoportada } from './errors.js';

/**
 * Estado del dominio, alineado con la columna `solicitudes.estado` del SQL
 * (`borrador, enviada, aceptada, entregada, cancelada`). `borrador` hace de
 * `pendiente` y `aceptada` de `aprobada`: las funciones hablan el idioma de la
 * base para que la fila no se traduzca al persistir. Es el mismo tipo del
 * contrato (`estadoSolicitudSchema`), reutilizado para no definir dos.
 */
export type EstadoSolicitudDominio = EstadoSolicitud;

export interface SolicitudEntreOllas {
  readonly id: string;
  readonly ollaOrigenId: string;
  readonly ollaDestinoId: string;
  readonly estado: EstadoSolicitudDominio;
  readonly items: readonly SolicitudItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
  // La fila de `solicitudes` exige `deviceId` y `lamport` (NOT NULL). No viven
  // en el modelo de dominio: los agrega la capa que persiste (repositorio).
}

export interface NuevaSolicitud {
  readonly id: string;
  readonly ollaOrigenId: string;
  readonly ollaDestinoId: string;
  readonly items: readonly SolicitudItem[];
  /** Instante ISO. La escribe quien llama: el dominio no lee el reloj. */
  readonly ahora: string;
}

/** Decisiones que mueven el estado; no son el estado en si. */
export type DecisionSolicitud = 'enviar' | 'aprobar' | 'entregar' | 'cancelar';

export interface ResultadoResolucion {
  readonly solicitud: SolicitudEntreOllas;
  /**
   * Movimientos append-only generados **solo** al entregar: dos entradas con
   * signo opuesto (origen negativo, destino positivo). Vacio en el resto:
   * enviar, aprobar o cancelar no mueven stock.
   */
  readonly movimientos: readonly Movimiento[];
}

/** La solicitud nace en `borrador` (pendiente), sin tocar despensa. */
export function crearSolicitud(nueva: NuevaSolicitud): SolicitudEntreOllas {
  return {
    id: nueva.id,
    ollaOrigenId: nueva.ollaOrigenId,
    ollaDestinoId: nueva.ollaDestinoId,
    estado: 'borrador',
    items: nueva.items,
    createdAt: nueva.ahora,
    updatedAt: nueva.ahora,
  };
}

/** Estados de origen validos por decision (no hay salto posible fuera de esto). */
const ORIGENES_VALIDOS: Readonly<Record<DecisionSolicitud, readonly EstadoSolicitudDominio[]>> = {
  enviar: ['borrador'],
  aprobar: ['enviada'],
  entregar: ['aceptada'],
  cancelar: ['borrador', 'enviada', 'aceptada'],
};

const ESTADO_DESTINO: Readonly<Record<DecisionSolicitud, EstadoSolicitudDominio>> = {
  enviar: 'enviada',
  aprobar: 'aceptada',
  entregar: 'entregada',
  cancelar: 'cancelada',
};

export interface ResolucionContexto {
  /** Instante ISO de la decision (determinista; no se lee el reloj). */
  readonly ahora: string;
  /** Autor del movimiento de entrega, si la decision es `entregar`. */
  readonly autor?: string;
  /**
   * Ids UUID de los dos movimientos de la transferencia, ya generados por el
   * caller (el repositorio). El dominio es determinista y no llama a
   * `randomUUID()`; la columna `movimientos.id` es `uuid`, asi que interpolar
   * un id no-UUID rompe el insert. Obligatorio al `entregar`.
   */
  readonly ids?: { readonly origen: string; readonly destino: string };
}

/**
 * Convierte una cantidad de captura a la unidad base del movimiento (g). Solo
 * hay equivalencia segura para `kg`; cualquier otra unidad (`taza`, `atado`…)
 * no tiene factor fijo y se rechaza con `UnidadNoSoportada` en vez de suponer
 * un número. `g` tambien vale (ya es base).
 */
function cantidadEnBase(cantidad: number, unidad: string, insumoId: string): number {
  if (unidad === 'kg') return cantidad * 1000;
  if (unidad === 'g') return cantidad;
  throw new UnidadNoSoportada(unidad, insumoId);
}

/**
 * Aplica una decision a la solicitud. Devuelve la solicitud nueva y, si es
 * `entregar`, la **transferencia** append-only: dos movimientos, origen con
 * delta negativo y destino con el mismo delta positivo (suma 0). No escribe.
 */
export function resolverSolicitud(
  solicitud: SolicitudEntreOllas,
  decision: DecisionSolicitud,
  contexto: ResolucionContexto,
): ResultadoResolucion {
  const origenValido = ORIGENES_VALIDOS[decision].includes(solicitud.estado);
  if (!origenValido) {
    throw new TransicionInvalida(solicitud.estado, ESTADO_DESTINO[decision]);
  }

  const nuevoEstado = ESTADO_DESTINO[decision];
  const solicitudActualizada: SolicitudEntreOllas = {
    ...solicitud,
    estado: nuevoEstado,
    updatedAt: contexto.ahora,
  };

  if (decision !== 'entregar') {
    return { solicitud: solicitudActualizada, movimientos: [] };
  }

  // Una transferencia mueve UN insumo por movimiento; la solicitud de un solo
  // insumo canaliza todo. Con varios, el primero lleva el modelo y el resto lo
  // compone la capa de despensa (el dominio entrega el modelo, no la fusion).
  const item = solicitud.items[0];
  if (item === undefined) {
    // `items.min(1)` lo impide en el schema; si igual llega vacio, no se inventa.
    throw new TransicionInvalida(solicitud.estado, 'entregada sin items');
  }

  const cantidad = cantidadEnBase(item.cantidad, item.unidad, item.insumoId);
  const autor = contexto.autor ?? 'dominio';
  const ids = contexto.ids;
  if (ids === undefined) {
    // Sin UUID no hay insert: `movimientos.id` es `uuid`. Se exige, no se inventa.
    throw new DatoFaltante('resolverSolicitud(entregar): faltan los ids UUID de los movimientos');
  }
  const base = {
    insumoId: item.insumoId,
    motivo: 'transferencia' as const,
    autor,
    at: contexto.ahora,
    createdAt: contexto.ahora,
    updatedAt: contexto.ahora,
    deletedAt: null,
    deviceId: 'entre-ollas',
    lamport: 0,
  };

  // Origen: sale del stock (delta negativo). Destino: entra el mismo stock
  // (delta positivo). Suma 0 con el origen: la transferencia no crea stock.
  const movimientos: readonly Movimiento[] = [
    {
      ...base,
      id: ids.origen,
      ollaId: solicitud.ollaOrigenId,
      delta: -cantidad,
    },
    {
      ...base,
      id: ids.destino,
      ollaId: solicitud.ollaDestinoId,
      delta: cantidad,
    },
  ];

  return { solicitud: solicitudActualizada, movimientos };
}
