import { useMemo, useState } from 'react';

import type { Clasificacion } from '@hackods/contracts';
import {
  clasificarItem,
  formatearCentimos,
  sumaAlPresupuesto,
  totalDeLineasConfirmadas,
  totalDelPapel,
} from '@hackods/domain';
import { BotonGrande, EncabezadoPantalla } from '@hackods/ui';

import {
  CANDIDATOS_POR_ITEM,
  ITEMS_BOLETA,
  type ItemBoleta,
} from '../../fixtures/comprobante-demo.js';

/** El formateo es del dominio: aca solo se reexporta para quien ya lo importaba. */
export { formatearCentimos };

/**
 * Comprobante del demo (paso 4 del guion): la cocinera fotografia una boleta y
 * revisa antes de que el dinero entre al presupuesto (DEC-2026-0008).
 *
 * La pantalla NO compara numeros propios ni suma: el estado de cada linea lo
 * decide `clasificarItem()` y los totales salen de `totalDeLineasConfirmadas()`
 * / `totalDelPapel()`, todo en `@hackods/domain`. Antes de confirmar no se toca
 * un numero del papel: se muestra textual.
 *
 * Distribucion: el total confirmado es la cifra de la pantalla y va fija
 * arriba en el telefono (se mira mientras se revisa) y a la derecha en
 * escritorio, junto a la lista de lineas en vez de encima. Cada linea es una
 * tarjeta con su boton de confirmar al ancho completo en el telefono.
 */

function cantidadLegible(item: ItemBoleta): string {
  const partes = [item.cantidadTextual, item.unidadCruda];
  const texto = partes.filter((parte) => parte !== null && parte !== '').join(' ');
  return texto === '' ? 'sin cantidad' : texto;
}

/** Motivo de revision en palabras de la cocinera, no de embeddings. */
function motivoLegible(clasificacion: Clasificacion): string {
  switch (clasificacion.motivo) {
    case 'margen_insuficiente':
      return 'Dos productos de la lista se parecen demasiado';
    case 'similitud_baja':
      return 'El nombre del papel no coincide con la lista';
    case 'sin_catalogo':
      return 'No hay candidatos en la lista';
    default:
      return 'Requiere tu revisión';
  }
}

function clasificarTodas(): Readonly<Record<string, Clasificacion>> {
  const mapa: Record<string, Clasificacion> = {};
  for (const item of ITEMS_BOLETA) {
    mapa[item.id] = clasificarItem(item, CANDIDATOS_POR_ITEM[item.id] ?? []);
  }
  return mapa;
}

export function ComprobantePage() {
  // La clasificacion es el resultado del extractor: se calcula una vez. Lo que
  // cambia al confirmar es el estado de la linea, no su clasificacion.
  const clasificaciones = useMemo(clasificarTodas, []);
  const [confirmados, setConfirmados] = useState<ReadonlySet<string>>(new Set());

  const confirmar = (itemId: string): void => {
    setConfirmados((previos) => new Set([...previos, itemId]));
  };

  const lineasConfirmadas = ITEMS_BOLETA.filter((item) => confirmados.has(item.id));
  // "Por revisar" es lo que el clasificador NO confirmó, no todo lo que falta tocar a mano:
  // las 4 líneas ya confirmadas por el clasificador no son un problema para la cocinera.
  const lineasPorRevisar = ITEMS_BOLETA.filter(
    (item) => clasificaciones[item.id]?.estado !== 'confirmado' && !confirmados.has(item.id),
  );
  // El JSX no suma: el dominio devuelve el total ya calculado.
  const totalConfirmado = totalDeLineasConfirmadas(lineasConfirmadas);
  const totalPapel = totalDelPapel(ITEMS_BOLETA);

  const revisadas = ITEMS_BOLETA.length - lineasPorRevisar.length;
  const avance = Math.round((revisadas / ITEMS_BOLETA.length) * 100);

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Comprobante"
        descripcion="Boleta de ejemplo: así se verían 6 líneas de una boleta leída."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-start lg:gap-6">
        {/* Resumen: en el telefono queda arriba y pegado; en escritorio, a la derecha. */}
        <div className="oc-tarjeta sticky top-0 z-10 flex flex-col gap-2 bg-superficie lg:col-start-2 lg:row-start-1 lg:sticky lg:top-2">
          <p className="text-sm text-texto-suave" data-estado="por-revisar">
            {lineasPorRevisar.length === 0
              ? `Las ${ITEMS_BOLETA.length} líneas coinciden con la lista.`
              : `${revisadas} ${revisadas === 1 ? 'línea coincide' : 'líneas coinciden'} con la lista; ${lineasPorRevisar.length} ${lineasPorRevisar.length === 1 ? 'necesita' : 'necesitan'} tu revisión.`}
          </p>
          <p className="oc-cifra" aria-live="polite" data-estado="total-confirmado">
            {formatearCentimos(totalConfirmado)}
          </p>
          <p className="text-sm text-texto-suave">
            Confirmado de {formatearCentimos(totalPapel)} del papel
          </p>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-tenue"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={avance}
            aria-label="Líneas revisadas"
          >
            <div className="h-full rounded-full bg-primario" style={{ width: `${avance}%` }} />
          </div>
          <p className="text-xs text-texto-suave">
            {revisadas} de {ITEMS_BOLETA.length} líneas listas
          </p>
        </div>

        <ul className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1" aria-label="Líneas de la boleta">
          {ITEMS_BOLETA.map((item) => {
            const clasificacion = clasificaciones[item.id];
            if (clasificacion === undefined) return null;
            const confirmado = confirmados.has(item.id);
            const suma = sumaAlPresupuesto(confirmado ? 'confirmado' : clasificacion.estado);
            return (
              <li
                key={item.id}
                data-estado={confirmado ? 'confirmado' : clasificacion.estado}
                data-suma={suma ? 'si' : 'no'}
                className={
                  confirmado || clasificacion.estado === 'confirmado'
                    ? 'oc-tarjeta flex flex-col gap-2 border-primario'
                    : 'oc-tarjeta flex flex-col gap-2 border-l-4 border-l-error'
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-mono text-base">{item.descripcionCruda}</span>
                  <span className="text-lg font-bold tabular-nums">
                    {formatearCentimos(item.totalLineaCentavos)}
                  </span>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs text-texto-suave">
                  <div>
                    <dt className="font-semibold">Cantidad</dt>
                    <dd>{cantidadLegible(item)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Unidad</dt>
                    <dd>{item.unidadCruda ?? 'sin unidad'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Precio unitario</dt>
                    <dd>
                      {item.precioUnitarioCrudoCentavos === null
                        ? 'sin dato'
                        : formatearCentimos(item.precioUnitarioCrudoCentavos)}
                    </dd>
                  </div>
                </dl>

                {confirmado ? (
                  <p className="flex items-center gap-2 text-sm font-bold text-primario">
                    <span aria-hidden="true">✓</span> Confirmado: suma al presupuesto.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p
                      className={
                        clasificacion.estado === 'confirmado'
                          ? 'text-sm font-semibold text-primario'
                          : 'text-sm font-semibold text-error'
                      }
                    >
                      {clasificacion.estado === 'confirmado'
                        ? 'Coincide con la lista. Confirma para que sume.'
                        : `Por revisar: no suma. ${motivoLegible(clasificacion)}.`}
                    </p>
                    <div className="shrink-0 [&>button]:w-full sm:[&>button]:w-auto">
                      <BotonGrande variante="secundario" onClick={() => confirmar(item.id)}>
                        {`Confirmar ${item.descripcionCruda}`}
                      </BotonGrande>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="flex flex-col gap-1 text-xs text-texto-suave">
        <span>
          Datos simulados: la boleta de demo ya viene leída, sin OCR ni cámara; cada línea se
          confirma a mano.
        </span>
        <span>Guardado en esta tablet. Todavía no se envía a ninguna parte.</span>
      </footer>
    </section>
  );
}
