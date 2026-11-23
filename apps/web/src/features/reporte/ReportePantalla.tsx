/**
 * Pantalla "Reporte" (#18): agregado entre ollas con una columna por olla
 * ficticia. El volumen movido y el filtro de identidad salen de
 * `agregadoEntreOllas` (`@hackods/domain`); esta capa solo dibuja la tabla. La
 * salida no lleva `codigoP`, ni alias, ni nombres de proveedores: el dominio ya
 * lo garantiza y aca no se agrega nada que no venga del agregado. La columna es
 * **volumen movido**, no un saldo: una salida sube el volumen, no lo baja.
 *
 * Texto: las categorías del dominio son claves (`granos`, `otros`) y el volumen
 * viaja en gramos. Acá se muestran como se leen ("Granos", "20 kg"); una celda
 * sin movimientos es "—", no un cero que parece un dato.
 *
 * La tabla usa `.oc-tabla` (tokens y densidad de escritorio) y scrollea en
 * horizontal en el telefono: se prefieren seis columnas legibles con scroll a
 * seis columnas aplastadas que no se pueden comparar.
 */
import { useMemo } from 'react';

import { EncabezadoPantalla } from '@hackods/ui';

import { formatearRango } from '../../app/fechas.js';
import {
  agregadoEntreOllas,
  type Movimiento,
  type OllaFicticia,
  type Periodo,
} from './dominio';

export interface ReportePantallaProps {
  readonly movimientos: readonly Movimiento[];
  readonly periodo: Periodo;
  readonly ollas?: readonly OllaFicticia[];
}

/** Un solo formateador: el volumen se compara entre celdas, no se lee. */
const KILOS = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

/** Clave de categoría del dominio → como se lee en la olla. */
function nombreCategoria(categoria: string): string {
  const texto = categoria.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El volumen del agregado viene en gramos. Se muestra en kg (20000 → "20 kg").
 * Cero o ausente es "—": no es lo mismo "no se movió nada" que "no hay dato",
 * pero en una celda de tabla los dos casos se leen mejor como vacío que como 0.
 */
function volumenLegible(gramos: number | undefined): string {
  if (gramos === undefined || gramos === 0) return '—';
  return `${KILOS.format(gramos / 1000)} kg`;
}

export function ReportePantalla({ movimientos, periodo, ollas }: ReportePantallaProps) {
  // El agregado solo depende de sus entradas: no se recalcula en cada render.
  const { categorias, filas } = useMemo(
    () => agregadoEntreOllas(movimientos, periodo, ollas),
    [movimientos, periodo, ollas],
  );

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Reporte entre ollas"
        descripcion={`Volumen movido por categoría · ${formatearRango(periodo.desde, periodo.hasta)} · Sin datos personales.`}
      />

      {categorias.length === 0 ? (
        <p className="oc-tarjeta text-texto-suave">No hay movimientos en este período.</p>
      ) : (
        <div className="overflow-x-auto rounded-oc border border-borde bg-superficie">
          <table className="oc-tabla min-w-[32rem]" data-reporte="entre-ollas">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                {filas.map((fila) => (
                  <th key={fila.ollaId} scope="col" className="oc-num" data-olla={fila.ollaId}>
                    {fila.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categorias.map((categoria) => (
                <tr key={categoria}>
                  <th scope="row">{nombreCategoria(categoria)}</th>
                  {filas.map((fila) => (
                    <td key={fila.ollaId} className="oc-num" data-categoria={categoria}>
                      {volumenLegible(fila.volumen[categoria])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
