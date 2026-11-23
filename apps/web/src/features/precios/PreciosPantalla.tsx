/**
 * Pantalla de precios de los insumos de la olla.
 *
 * Lista los seis productos con su mediana y su variación, y muestra el detalle
 * del que se elige. La variación es SIEMPRE contra la MEDIANA de la ventana
 * actual vs la previa; nunca un promedio (un error de unidad mueve el promedio,
 * ver el atípico del pollo). La mediana y el filtro de atípicos salen de
 * `medianaMovil` de `@hackods/domain`, vía `calcularTendencia`.
 *
 * Presentación: la lista es el índice (se comparan los seis de un vistazo) y el
 * detalle es la cifra que se viene a ver. En el teléfono van uno debajo del
 * otro; en escritorio, la lista a la izquierda y el detalle fijo a la derecha.
 *
 * Honestidad: los datos son un fixture de demo cargado a mano. No hay OCR, ni
 * voz, ni embeddings acá, y la pantalla no insinúa que los haya.
 */
import { useMemo, useState } from 'react';

import { BotonGrande, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

import { formatearVariacionBp } from '../presupuesto/formato';
import { formatearPrecioSoles } from './formato-precio';
import { calcularTendencia, type Tendencia } from './tendencia';
import { unidadLegible } from './unidad';
import type { ObservacionPrecio } from './dominio';

export type EstadoPantallaPrecio = 'listo' | 'cargando' | 'error' | 'sin-conexion';

/**
 * Un producto con sus dos ventanas. La pantalla no sabe de precios: recibe las
 * observaciones y el nombre, y `calcularTendencia` hace la cuenta.
 */
export interface ProductoPrecio {
  readonly id: string;
  /** Minúsculas: la pantalla lo capitaliza. */
  readonly nombre: string;
  readonly unidad: string;
  readonly ventanaActual: readonly ObservacionPrecio[];
  readonly ventanaPrevia: readonly ObservacionPrecio[];
}

export interface PreciosPantallaProps {
  readonly productos: readonly ProductoPrecio[];
  /** Fuente/canal únicos para la pantalla (hoy no viaja por observación). */
  readonly fuente: string;
  /** Id del producto que se abre seleccionado. Por defecto, el primero. */
  readonly productoInicial?: string;
  readonly estado?: EstadoPantallaPrecio;
  readonly onReintentar?: () => void;
}

/** "S/ 1,40 / kg". */
function precioConUnidad(micro: number | null, unidad: string): string {
  return `${formatearPrecioSoles(micro)} / ${unidadLegible(unidad)}`;
}

/** Texto de variación: "+12,00 %", "−0,50 %" o "sin dato". */
function textoVariacion(tendencia: Tendencia): string {
  if (tendencia.sinDato || tendencia.variacionBp === null) {
    return 'sin dato';
  }
  return formatearVariacionBp(tendencia.variacionBp);
}

function TendenciaBadge({
  tendencia,
  compacto = false,
}: {
  readonly tendencia: Tendencia;
  readonly compacto?: boolean;
}) {
  const base = compacto
    ? 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold tabular-nums'
    : 'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-bold tabular-nums';

  if (tendencia.sinDato) {
    return (
      <span
        className={`${base} border-borde bg-tenue text-texto-suave`}
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
  // La flecha repite lo que dice el color: subió, bajó o igual.
  const flecha = sube ? '▲' : baja ? '▼' : '=';
  return (
    <span className={`${base} ${clase}`} data-tono={tono}>
      <span aria-hidden="true">{flecha}</span>
      {textoVariacion(tendencia)}
      <span className="sr-only">{sube ? 'subió' : baja ? 'bajó' : 'igual'}</span>
    </span>
  );
}

/** MEDIA 4: esto se pinta dentro del <main> de Shell; va como <section>. */
export function PreciosPantalla({
  productos,
  fuente,
  productoInicial,
  estado = 'listo',
  onReintentar,
}: PreciosPantallaProps) {
  const [elegido, setElegido] = useState(productoInicial ?? productos[0]?.id ?? '');

  // Una sola pasada: la lista y el detalle leen de la misma tendencia.
  const tendencias = useMemo(() => {
    const mapa = new Map<string, Tendencia>();
    for (const producto of productos) {
      mapa.set(
        producto.id,
        calcularTendencia({
          ventanaActual: producto.ventanaActual,
          ventanaPrevia: producto.ventanaPrevia,
        }),
      );
    }
    return mapa;
  }, [productos]);

  if (estado === 'cargando') {
    return (
      <section className="flex flex-col gap-4" aria-busy="true">
        <EncabezadoPantalla titulo="Precio de los insumos" />
        <EstadoPantalla estado="cargando">Cargando observaciones…</EstadoPantalla>
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <EncabezadoPantalla titulo="Precio de los insumos" />
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

  const producto = productos.find((p) => p.id === elegido) ?? productos[0];
  const tendencia = producto === undefined ? undefined : tendencias.get(producto.id);
  const outlier =
    tendencia?.serieActual.evaluadas.find((obs) => obs.excluida) ?? null;
  const outlierPrevio =
    tendencia?.seriePrevia.evaluadas.find((obs) => obs.excluida) ?? null;

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Precio de los insumos"
        descripcion={
          <>
            Series de demo cargadas a mano (sin OCR ni voz). El precio típico de esta quincena se
            compara con el de la anterior. Fuente: {fuente}.
          </>
        }
      />

      {estado === 'sin-conexion' && (
        <EstadoPantalla estado="sin-conexion">
          Se muestra lo último guardado en esta tablet. Todavía no se envía a ninguna parte.
        </EstadoPantalla>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-6">
        {/* El índice: se comparan los seis de un vistazo. */}
        <section
          aria-label="Productos"
          className="overflow-hidden rounded-oc border border-borde bg-superficie"
        >
          <h3 className="border-b border-borde px-4 py-3 text-sm font-bold uppercase tracking-wide text-texto-suave">
            Insumos
          </h3>
          <ul className="divide-y divide-borde">
            {productos.map((item) => {
              const suya = tendencias.get(item.id);
              const activo = item.id === elegido;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={activo}
                    onClick={() => setElegido(item.id)}
                    className={[
                      'flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left',
                      activo ? 'bg-primario-suave' : 'bg-superficie hover:bg-tenue',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'min-w-0 truncate text-base font-semibold capitalize',
                        activo ? 'text-primario' : 'text-texto',
                      ].join(' ')}
                    >
                      {item.nombre}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">
                        {suya === undefined ? 'sin dato' : formatearPrecioSoles(suya.medianaActual)}
                        <span className="text-xs font-normal text-texto-suave">
                          {' '}
                          / {unidadLegible(item.unidad)}
                        </span>
                      </span>
                      {suya === undefined ? null : (
                        <TendenciaBadge tendencia={suya} compacto />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* El detalle del elegido. */}
        <section
          aria-label="Detalle del producto"
          className="oc-tarjeta flex flex-col gap-3 lg:sticky lg:top-2 lg:col-start-2 lg:row-start-1"
        >
          {producto === undefined || tendencia === undefined ? (
            <p className="text-sm text-texto-suave">No hay productos para mostrar.</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-texto-suave">
                <span className="capitalize">{producto.nombre}</span>
                <span className="block text-xs font-normal">
                  precio típico de las últimas {producto.ventanaActual.length} compras
                </span>
              </p>
              <p className="oc-cifra">
                {tendencia.sinDato
                  ? 'sin dato'
                  : precioConUnidad(tendencia.medianaActual, producto.unidad)}
              </p>
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-texto-suave">Antes y ahora:</span>
                <TendenciaBadge tendencia={tendencia} />
              </p>

              {tendencia.sinDato && (
                <p className="text-sm text-texto-suave" data-motivo={tendencia.motivo ?? 'na'}>
                  No hay suficientes compras para comparar. No se inventa un número.
                </p>
              )}

              {tendencia.medianaPrevia !== null && !tendencia.sinDato && (
                <p className="text-sm text-texto-suave">
                  Antes {precioConUnidad(tendencia.medianaPrevia, producto.unidad)} · ahora{' '}
                  {precioConUnidad(tendencia.medianaActual, producto.unidad)}
                </p>
              )}

              {outlier !== null && (
                <p className="text-sm text-texto-suave" data-estado="outlier">
                  {/* El x10 es un error de tipeo, no un salto de precio: se dice
                      como es, porque si no parecería que el precio se multiplicó. */}
                  Un precio muy distinto quedó fuera del cálculo.
                </p>
              )}

              {outlierPrevio !== null && (
                <p className="text-sm text-texto-suave" data-estado="outlier-previo">
                  Un precio de la quincena anterior también quedó fuera del cálculo.
                </p>
              )}

              <p className="mt-auto border-t border-borde pt-3 text-xs text-texto-suave">
                Datos simulados: series de demo, sin escaneo de boletas.
              </p>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
