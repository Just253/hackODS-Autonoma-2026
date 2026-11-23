/**
 * Pantalla "Entre ollas" (#18): muestra un pedido (20 kg de arroz) con su
 * estado, y permite aprobar, cancelar o entregar. Las transiciones y el
 * movimiento de entrega salen de `@hackods/domain`; la pantalla solo pinta el
 * estado y compone el texto. Sin estado global: el pedido llega por props y los
 * cambios viven en `useState` local.
 *
 * Una entrega NO mueve stock aca: se muestra el movimiento que el dominio
 * devuelve, para que la despensa lo escriba (append-only). El saldo se deriva.
 */
import { useState } from 'react';

import { BotonGrande } from '@hackods/ui';

import {
  TransicionInvalida,
  crearSolicitud,
  resolverSolicitud,
  type DecisionSolicitud,
  type NuevaSolicitud,
  type SolicitudEntreOllas,
} from './dominio';

export interface SolicitudPantallaProps {
  readonly nueva: NuevaSolicitud;
  /** Instante por defecto para las decisiones (determinista, sin reloj). */
  readonly ahora: string;
}

/** UUIDs fijos de la transferencia demo: la columna `movimientos.id` es uuid. */
const IDS_DEMO = {
  origen: '0f0e0d0c-0b0a-4908-8706-050403020100',
  destino: '1a1b1c1d-1e1f-4a2b-8c3d-4e5f60718293',
} as const;

const TONO: Readonly<Record<string, string>> = {
  borrador: 'pendiente',
  enviada: 'enviada',
  aceptada: 'aprobada',
  entregada: 'entregada',
  cancelada: 'cancelada',
};

const ETIQUETA: Readonly<Record<string, string>> = {
  borrador: 'Pendiente',
  enviada: 'Enviada',
  aceptada: 'Aprobada',
  entregada: 'Entregada',
  cancelada: 'Cancelada',
};

function formatearCantidad(cantidad: number, unidad: string): string {
  const numero = Number.isInteger(cantidad) ? String(cantidad) : cantidad.toFixed(1);
  return `${numero} ${unidad}`;
}

export function SolicitudPantalla({ nueva, ahora }: SolicitudPantallaProps) {
  const [solicitud, setSolicitud] = useState<SolicitudEntreOllas>(() => crearSolicitud(nueva));
  const [error, setError] = useState<string | null>(null);
  const [movimiento, setMovimiento] = useState<string | null>(null);

  const item = solicitud.items[0];
  const pedido = item ? formatearCantidad(item.cantidad, item.unidad) : 'sin items';
  const tono = TONO[solicitud.estado] ?? 'pendiente';

  const resolver = (decision: DecisionSolicitud): void => {
    setError(null);
    try {
      const resultado = resolverSolicitud(solicitud, decision, {
        ahora,
        autor: 'cocinera',
        ids: IDS_DEMO,
      });
      setSolicitud(resultado.solicitud);
      if (resultado.movimientos.length > 0) {
        // La entrega son dos movimientos (origen negativo, destino positivo):
        // se muestran los deltas para ver que la transferencia no crea stock.
        const detalle = resultado.movimientos
          .map((m) => `${m.ollaId}: ${m.delta >= 0 ? '+' : ''}${m.delta}`)
          .join(' · ');
        setMovimiento(`${pedido} transferidos (pendiente de registrar). ${detalle}`);
      }
    } catch (e) {
      if (e instanceof TransicionInvalida) {
        setError(
          `No se puede: la solicitud está ${ETIQUETA[e.estadoActual]?.toLowerCase() ?? e.estadoActual}.`,
        );
        return;
      }
      throw e;
    }
  };

  const puedeEnviar = solicitud.estado === 'borrador';
  const puedeAprobar = solicitud.estado === 'enviada';
  const puedeEntregar = solicitud.estado === 'aceptada';
  const puedeCancelar =
    solicitud.estado === 'borrador' ||
    solicitud.estado === 'enviada' ||
    solicitud.estado === 'aceptada';

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Entre ollas</h2>
        <p className="text-gray-600">Pedido entre ollas, sin mover stock hasta la entrega.</p>
      </div>

      <div
        className="flex flex-col gap-1 rounded-lg border border-gray-300 bg-gray-50 p-4"
        data-estado={solicitud.estado}
        data-tono={tono}
      >
        <p className="text-lg font-semibold">Pedido: {pedido} de arroz</p>
        <p>
          Estado: <strong data-estado-texto>{ETIQUETA[solicitud.estado] ?? solicitud.estado}</strong>
        </p>
      </div>

      {error !== null ? (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      ) : null}

      {movimiento !== null ? (
        <div
          role="status"
          className="rounded-lg border border-gray-300 bg-gray-50 p-4"
          data-estado="movimiento-generado"
        >
          <p className="font-semibold">Entrega registrada</p>
          <p className="text-gray-600">{movimiento}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <BotonGrande disabled={!puedeEnviar} onClick={() => resolver('enviar')}>
          Enviar
        </BotonGrande>
        <BotonGrande disabled={!puedeAprobar} onClick={() => resolver('aprobar')}>
          Aprobar
        </BotonGrande>
        <BotonGrande
          variante="secundario"
          disabled={!puedeEntregar}
          onClick={() => resolver('entregar')}
        >
          Entregar
        </BotonGrande>
        <BotonGrande
          variante="secundario"
          disabled={!puedeCancelar}
          onClick={() => resolver('cancelar')}
        >
          Cancelar
        </BotonGrande>
      </div>
    </section>
  );
}
