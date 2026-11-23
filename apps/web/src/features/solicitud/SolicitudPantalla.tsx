/**
 * Pantalla "Entre ollas" (#18): muestra un pedido (20 kg de arroz) con su
 * estado, y permite aprobar, cancelar o entregar. Las transiciones y el
 * movimiento de entrega salen de `@hackods/domain`; la pantalla solo pinta el
 * estado y compone el texto. Sin estado global: el pedido llega por props y los
 * cambios viven en `useState` local.
 *
 * Una entrega NO mueve stock aca: se muestra el movimiento que el dominio
 * devuelve, para que la despensa lo escriba (append-only). El saldo se deriva.
 *
 * Distribucion: el pedido y sus decisiones son la columna principal; lo que
 * genero la entrega (el movimiento) va al costado en escritorio y debajo en el
 * telefono. Todo con los tokens de la app: esta pantalla era la unica que
 * mezclaba `gray-*` sueltos.
 */
import { useState } from 'react';

import { OLLAS_DEMO } from '@hackods/domain';
import { BotonGrande, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

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
        // La entrega son dos apuntes: la olla que entrega y la que recibe. Se
        // nombran por su titulo publico ("Olla Norte"), nunca por el id interno.
        const sale = resultado.movimientos.find((m) => m.delta < 0);
        const entra = resultado.movimientos.find((m) => m.delta > 0);
        const titulo = (ollaId: string): string =>
          OLLAS_DEMO.find((olla) => olla.ollaId === ollaId)?.titulo ?? 'La otra olla';
        if (sale !== undefined && entra !== undefined) {
          setMovimiento(
            `${titulo(sale.ollaId)} entregó ${pedido} · ${titulo(entra.ollaId)} recibió ${pedido}`,
          );
        }
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
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Entre ollas"
        descripcion="Pedido entre ollas: nada se mueve hasta que se entrega."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <div
            className="oc-tarjeta flex flex-col gap-1"
            data-estado={solicitud.estado}
            data-tono={tono}
          >
            <p className="text-lg font-semibold">Pedido: {pedido} de arroz</p>
            <p className="flex flex-wrap items-center gap-2">
              Estado:
              <span className="inline-flex items-center rounded-full border border-borde-fuerte bg-tenue px-3 py-0.5">
                <strong data-estado-texto>
                  {ETIQUETA[solicitud.estado] ?? solicitud.estado}
                </strong>
              </span>
            </p>
          </div>

          {error !== null ? (
            <EstadoPantalla estado="error">{error}</EstadoPantalla>
          ) : null}

          <div className="oc-tarjeta flex flex-col gap-2">
            <p className="text-sm font-semibold text-texto-suave">Decisiones del pedido</p>
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
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {movimiento !== null ? (
            <div
              role="status"
              className="oc-tarjeta flex flex-col gap-1 border-primario bg-primario-suave"
              data-estado="movimiento-generado"
            >
              <p className="font-semibold">Entrega registrada</p>
              <p className="text-sm text-texto-suave">{movimiento}</p>
            </div>
          ) : (
            <div className="oc-tarjeta flex flex-col gap-1" data-estado="sin-movimiento">
              <p className="text-sm font-semibold text-texto-suave">Qué movió la entrega</p>
              <p className="text-sm text-texto-suave">
                Todavía no hay nada. Cuando se entregue, quedan dos apuntes: lo que sale de una
                olla y lo que entra en la otra.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
