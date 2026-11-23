/**
 * Pantalla de precio del pollo (issue #10, D8 / DEC-2026-0008). Muestra la
 * variación contra la MEDIANA de la ventana actual vs la previa, con la fuente
 * visible. Nunca un promedio. Si falta una ventana, dice "sin dato".
 */
import { BotonGrande } from '@hackods/ui';

import { formatearPuntosBase } from '../presupuesto/formato';
import { formatearPrecioSoles } from './formato-precio';
import { calcularTendencia, type OpcionesTendencia } from './tendencia';
import type { ObservacionPrecio } from './dominio';

export type EstadoPantallaPrecio = 'listo' | 'cargando' | 'error' | 'sin-conexion';

export interface PreciosPantallaProps {
  readonly producto: string;
  /** Unidad base visible, ej. "kg". */
  readonly unidad: string;
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

/** Texto de variación: "+12,00 %" o "sin dato". */
function textoVariacion(tendencia: ReturnType<typeof calcularTendencia>): string {
  if (tendencia.sinDato || tendencia.variacionBp === null) {
    return 'sin dato';
  }
  const signo = tendencia.variacionBp > 0 ? '+' : '';
  return `${signo}${formatearPuntosBase(tendencia.variacionBp)}`;
}

function TendenciaBadge({ tendencia }: { readonly tendencia: ReturnType<typeof calcularTendencia> }) {
  if (tendencia.sinDato) {
    return (
      <span className="oc-badge oc-badge--tenue" data-estado="sin-dato">
        sin dato
      </span>
    );
  }
  const sube = tendencia.variacionBp !== null && tendencia.variacionBp > 0;
  const baja = tendencia.variacionBp !== null && tendencia.variacionBp < 0;
  const tono = sube ? 'alza' : baja ? 'baja' : 'igual';
  return (
    <span className={`oc-badge oc-badge--${tono}`} data-tono={tono}>
      {textoVariacion(tendencia)}
    </span>
  );
}

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
      <main className="oc-pantalla" aria-busy="true">
        <h1 className="oc-titulo">Precio del {producto}</h1>
        <p className="oc-aviso oc-aviso--tenue" role="status">
          Cargando observaciones…
        </p>
      </main>
    );
  }

  if (estado === 'error') {
    return (
      <main className="oc-pantalla">
        <h1 className="oc-titulo">Precio del {producto}</h1>
        <div className="oc-aviso oc-aviso--critica" role="alert">
          No se pudieron leer las observaciones guardadas.
          {onReintentar !== undefined && (
            <div className="oc-accion">
              <BotonGrande variante="secundario" onClick={onReintentar}>
                Reintentar
              </BotonGrande>
            </div>
          )}
        </div>
      </main>
    );
  }

  const opciones: OpcionesTendencia = { ventanaActual, ventanaPrevia };
  const tendencia = calcularTendencia(opciones);
  const outlier = tendencia.serieActual.evaluadas.find((obs) => obs.excluida) ?? null;

  return (
    <main className="oc-pantalla">
      <header className="oc-cabecera">
        <h1 className="oc-titulo">Precio del {producto}</h1>
        <p className="oc-tenue">Fuente: {fuente}</p>
      </header>

      {estado === 'sin-conexion' && (
        <div className="oc-aviso oc-aviso--tenue" role="status" data-estado="sin-conexion">
          <strong>Sin conexión.</strong> Se muestran las observaciones guardadas.
          <br />
          <span className="oc-badge">pendiente de sincronizar</span>
        </div>
      )}

      <section className="oc-ficha" aria-label="Tendencia del precio">
        <p className="oc-precio">
          <strong>{precioConUnidad(tendencia.medianaActual, unidad)}</strong>
          <small className="oc-tenue"> mediana de las últimas {ventanaActual.length} observaciones</small>
        </p>
        <p className="oc-variacion">
          Variación contra la mediana previa: <TendenciaBadge tendencia={tendencia} />
        </p>
        {tendencia.sinDato && (
          <p className="oc-tenue" data-motivo={tendencia.motivo ?? 'na'}>
            No hay suficientes observaciones para comparar. No se interpola.
          </p>
        )}
        {tendencia.medianaPrevia !== null && !tendencia.sinDato && (
          <p className="oc-tenue">
            Mediana previa {precioConUnidad(tendencia.medianaPrevia, unidad)} · mediana actual{' '}
            {precioConUnidad(tendencia.medianaActual, unidad)}
          </p>
        )}
        {outlier !== null && (
          <p className="oc-tenue" data-estado="outlier">
            Una observación se marcó como atípica y no entra en la tendencia.
          </p>
        )}
      </section>
    </main>
  );
}
