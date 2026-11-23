/**
 * Pantalla de precio del pollo (issue #10, D8 / DEC-2026-0008). Muestra la
 * variación contra la MEDIANA de la ventana actual vs la previa, con la fuente
 * visible. Nunca un promedio. Si falta una ventana, dice "sin dato".
 *
 * Presentacion movil: el precio por unidad es la cifra heroe y la variacion va
 * en una pastilla con flecha + numero + palabra, no solo color: al sol y para
 * quien no distingue verde de rojo, la flecha y el signo dicen lo mismo.
 */
import { BotonGrande, EstadoPantalla } from '@hackods/ui';

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
      <span
        className="inline-flex items-center gap-1 rounded-full border border-borde bg-tenue px-3 py-1 text-sm font-semibold text-texto-suave"
        data-estado="sin-dato"
      >
        sin dato
      </span>
    );
  }
  const sube = tendencia.variacionBp !== null && tendencia.variacionBp > 0;
  const baja = tendencia.variacionBp !== null && tendencia.variacionBp < 0;
  const tono = sube ? 'alza' : baja ? 'baja' : 'igual';
  const clase = sube
    ? 'border-error bg-error-suave text-error'
    : baja
      ? 'border-primario bg-primario-suave text-primario'
      : 'border-borde bg-tenue text-texto-suave';
  // La flecha repite lo que dice el color: subio, bajo o igual.
  const flecha = sube ? '▲' : baja ? '▼' : '=';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold tabular-nums ${clase}`}
      data-tono={tono}
    >
      <span aria-hidden="true">{flecha}</span>
      {textoVariacion(tendencia)}
      <span className="sr-only">{sube ? 'subió' : baja ? 'bajó' : 'igual'}</span>
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
        <h2 className="text-xl font-bold">Precio del {producto}</h2>
        <EstadoPantalla estado="cargando">Cargando observaciones…</EstadoPantalla>
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Precio del {producto}</h2>
        <EstadoPantalla
          estado="error"
          accion={
            onReintentar === undefined ? undefined : (
              <BotonGrande variante="secundario" onClick={onReintentar}>
                Reintentar
              </BotonGrande>
            )
          }
        >
          No se pudieron leer las observaciones guardadas.
        </EstadoPantalla>
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
        <h2 className="text-xl font-bold">Precio del {producto}</h2>
        <p className="text-sm text-texto-suave">Fuente: {fuente}</p>
      </header>

      {estado === 'sin-conexion' && (
        <EstadoPantalla
          estado="sin-conexion"
          accion={<span className="oc-pendiente">pendiente de sincronizar</span>}
        >
          Se muestran las observaciones guardadas.
        </EstadoPantalla>
      )}

      <section className="oc-tarjeta flex flex-col gap-2" aria-label="Tendencia del precio">
        <p className="text-sm text-texto-suave">
          mediana de las últimas {ventanaActual.length} observaciones
        </p>
        <p className="oc-cifra">{precioConUnidad(tendencia.medianaActual, unidad)}</p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-texto-suave">Variación contra la mediana previa:</span>
          <TendenciaBadge tendencia={tendencia} />
        </p>
        {tendencia.sinDato && (
          <p className="text-sm text-texto-suave" data-motivo={tendencia.motivo ?? 'na'}>
            No hay suficientes observaciones para comparar. No se interpola.
          </p>
        )}
        {tendencia.medianaPrevia !== null && !tendencia.sinDato && (
          <p className="text-sm text-texto-suave">
            Mediana previa {precioConUnidad(tendencia.medianaPrevia, unidad)} · mediana actual{' '}
            {precioConUnidad(tendencia.medianaActual, unidad)}
          </p>
        )}
        {outlier !== null && (
          <p className="text-sm text-texto-suave" data-estado="outlier">
            Una observación se marcó como atípica y no entra en la tendencia.
          </p>
        )}
        {outlierPrevio !== null && (
          <p className="text-sm text-texto-suave" data-estado="outlier-previo">
            Una observación de la ventana previa se marcó como atípica y no entra en esa mediana.
          </p>
        )}
      </section>
    </section>
  );
}
