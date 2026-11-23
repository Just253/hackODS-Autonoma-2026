import { useMemo, useState } from 'react';

import type { Clasificacion } from '@hackods/contracts';
import {
  clasificarItem,
  CONFIG_CLASIFICACION,
  formatearCentimos,
  sumaAlPresupuesto,
  totalDeLineasConfirmadas,
  totalDelPapel,
} from '@hackods/domain';
import { BotonGrande } from '@hackods/ui';

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
      return 'dos productos del catálogo se parecen demasiado';
    case 'similitud_baja':
      return 'el nombre del papel no coincide con el catálogo';
    case 'sin_catalogo':
      return 'no hay candidatos en el catálogo';
    default:
      return 'requiere tu revisión';
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
  const lineasPorRevisar = ITEMS_BOLETA.filter((item) => !confirmados.has(item.id));
  // El JSX no suma: el dominio devuelve el total ya calculado.
  const totalConfirmado = totalDeLineasConfirmadas(lineasConfirmadas);
  const totalPapel = totalDelPapel(ITEMS_BOLETA);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Comprobante</h2>
        <p className="text-gray-600">
          Boleta de ejemplo: 6 líneas leídas del papel. Nada suma al presupuesto hasta que
          confirmes la línea.
        </p>
      </div>

      <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
        <p className="text-gray-600" data-estado="por-revisar">
          {lineasPorRevisar.length} de {ITEMS_BOLETA.length} líneas por revisar: no suman al
          presupuesto.
        </p>
        <p className="text-3xl font-bold" aria-live="polite" data-estado="total-confirmado">
          {formatearCentimos(totalConfirmado)}
        </p>
        <p className="text-gray-600">
          Confirmado de {formatearCentimos(totalPapel)} del papel
        </p>
      </div>

      <ul className="flex flex-col gap-3" aria-label="Líneas de la boleta">
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
                confirmado
                  ? 'flex flex-col gap-2 rounded-lg border border-green-600 p-4'
                  : 'flex flex-col gap-2 rounded-lg border border-red-500 bg-red-50 p-4'
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-lg">{item.descripcionCruda}</span>
                <span className="font-semibold">{formatearCentimos(item.totalLineaCentavos)}</span>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-sm text-gray-700">
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
                <p className="font-semibold text-green-700">Confirmado: suma al presupuesto.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold text-red-700">
                    Por revisar: no suma. {motivoLegible(clasificacion)}.
                  </p>
                  <div>
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

      <footer className="flex flex-col gap-1 text-sm text-gray-600">
        <span>
          Umbrales del catálogo: TAU {CONFIG_CLASIFICACION.tau}, margen {CONFIG_CLASIFICACION.margen}, piso {CONFIG_CLASIFICACION.piso}.
        </span>
        <span>
          Pendiente de sincronizar: lo confirmado queda en este dispositivo hasta que haya red.
        </span>
      </footer>
    </section>
  );
}