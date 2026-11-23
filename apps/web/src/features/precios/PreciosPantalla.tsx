/**
 * Pantalla de precio del pollo (issue #10, D8 / DEC-2026-0008). Muestra la
 * variación contra la MEDIANA de la ventana actual vs la previa, con la fuente
 * visible. Nunca un promedio. Si falta una ventana, dice "sin dato".
 */
import { BotonGrande } from '@hackods/ui';

import { formatearVariacionBp } from '../presupuesto/formato';
import { formatearPrecioSoles } from './formato-precio';
import { calcularTendencia, type OpcionesTendencia } from './tendencia';
import type { ObservacionPrecio } from './dominio';

export type EstadoPantallaPrecio = 'listo' | 'cargando' | 'error' | 'sin-conexion';

/**
 * TODO(canal-por-observacion) — MEDIA 6, hueco de contrato.
 *
 * D8 pide que la serie NO mezcle canales (mayorista/minorista) y que el canal y
 * la fuente viajen POR OBSERVACIÓN. Hoy no se puede cumplir desde esta capa:
 *   - `ObservacionPrecio` (packages/domain/src/precios/serie.ts:19-23) solo
 *     tiene `id`, `valor`, `fecha`. No hay `canal` ni `fuente`.
 *   - `medianaMovil` (packages/domain/src/precios/serie.ts:89) no agrupa por
 *     canal: mezcla todo lo que recibe.
 * `packages/domain` es de otro dueño (area:contracts), así que no se cambia
 * acá. Mitigación mientras tanto: `fuente` es única y global para la pantalla y
 * los fixtures demo son de UN solo canal (mayorista), así que no se mezclan.
 */
export interface PreciosPantallaProps {
  readonly producto: string;
  /** Unidad base visible, ej. "kg". */
  readonly unidad: string;
  /** Fuente/canal globales; ver TODO(canal-por-observacion). */
  readonly fuente: string;
  readonly ventanaActual: readonly ObservacionPrecio[];
  readonly ventanaPrevia: readonly ObservacionPrecio[];
  readonly estado?: EstadoPantallaPrecio;
  readonly onReintentar?: () => void;
}

/** "S/ 1,40 / kg". */
function precioConUnidad(micro: number | null, unidad: string): string {
  return `${formatearPrecioSoles(micro)} / ${unidad}`;
}

/** Texto de variación: "+12,00 %", "−0,50 %" o "sin dato". */
function textoVariacion(tendencia: ReturnType<typeof calcularTendencia>): string {
  if (tendencia.sinDato || tendencia.variacionBp === null) {
    return 'sin dato';
  }
  return formatearVariacionBp(tendencia.variacionBp);
}

function TendenciaBadge({ tendencia }: { readonly tendencia: ReturnType<typeof calcularTendencia> }) {
  if (tendencia.sinDato) {
    return (
      <span className="rounded bg-gray-200 px-2 py-1 text-sm" data-estado="sin-dato">
        sin dato
      </span>
    );
  }
  const sube = tendencia.variacionBp !== null && tendencia.variacionBp > 0;
  const baja = tendencia.variacionBp !== null && tendencia.variacionBp < 0;
  const tono = sube ? 'alza' : baja ? 'baja' : 'igual';
  const clase = sube
    ? 'rounded bg-red-100 px-2 py-1 text-sm'
    : baja
      ? 'rounded bg-green-100 px-2 py-1 text-sm'
      : 'rounded bg-gray-200 px-2 py-1 text-sm';
  return (
    <span className={clase} data-tono={tono}>
      {textoVariacion(tendencia)}
    </span>
  );
}

/** MEDIA 4: esto se pinta dentro del <main> de Shell; va como <section>. */
export function PreciosPantalla({
  producto,
  unidad,
  fuente,
  ventanaActual,
  ventanaPrevia,
  estado = 'listo',
  onReintentar,
}: PreciosPantallaProps) {
  if (estado === 'cargando') {
    return (
      <section className="flex flex-col gap-4" aria-busy="true">
        <h2 className="text-2xl font-bold">Precio del {producto}</h2>
        <p className="text-gray-600" role="status">
          Cargando observaciones…
        </p>
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Precio del {producto}</h2>
        <div className="rounded-lg border border-red-400 bg-red-50 p-4" role="alert">
          No se pudieron leer las observaciones guardadas.
          {onReintentar !== undefined && (
            <div className="mt-2">
              <BotonGrande variante="secundario" onClick={onReintentar}>
                Reintentar
              </BotonGrande>
            </div>
          )}
        </div>
      </section>
    );
  }

  const opciones: OpcionesTendencia = { ventanaActual, ventanaPrevia };
  const tendencia = calcularTendencia(opciones);
  const outlier = tendencia.serieActual.evaluadas.find((obs) => obs.excluida) ?? null;
  const outlierPrevio = tendencia.seriePrevia.evaluadas.find((obs) => obs.excluida) ?? null;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Precio del {producto}</h2>
        <p className="text-gray-600">Fuente: {fuente}</p>
      </header>

      {estado === 'sin-conexion' && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 p-4" role="status" data-estado="sin-conexion">
          <strong>Sin conexión.</strong> Se muestran las observaciones guardadas.
          <br />
          <span className="rounded bg-gray-200 px-2 py-1 text-sm">pendiente de sincronizar</span>
        </div>
      )}

      <section className="rounded-lg border border-gray-300 p-4" aria-label="Tendencia del precio">
        <p className="text-lg">
          <strong>{precioConUnidad(tendencia.medianaActual, unidad)}</strong>
          <small className="text-gray-600"> mediana de las últimas {ventanaActual.length} observaciones</small>
        </p>
        <p>
          Variación contra la mediana previa: <TendenciaBadge tendencia={tendencia} />
        </p>
        {tendencia.sinDato && (
          <p className="text-gray-600" data-motivo={tendencia.motivo ?? 'na'}>
            No hay suficientes observaciones para comparar. No se interpola.
          </p>
        )}
        {tendencia.medianaPrevia !== null && !tendencia.sinDato && (
          <p className="text-gray-600">
            Mediana previa {precioConUnidad(tendencia.medianaPrevia, unidad)} · mediana actual{' '}
            {precioConUnidad(tendencia.medianaActual, unidad)}
          </p>
        )}
        {outlier !== null && (
          <p className="text-gray-600" data-estado="outlier">
            Una observación se marcó como atípica y no entra en la tendencia.
          </p>
        )}
        {outlierPrevio !== null && (
          <p className="text-gray-600" data-estado="outlier-previo">
            Una observación de la ventana previa se marcó como atípica y no entra en esa mediana.
          </p>
        )}
      </section>
    </section>
  );
}
