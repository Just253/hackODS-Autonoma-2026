/**
 * Pantalla "Reporte" (#18): agregado entre ollas con una columna por olla
 * ficticia. El volumen movido y el filtro de identidad salen de
 * `agregadoEntreOllas` (`@hackods/domain`); esta capa solo dibuja la tabla. La
 * salida no lleva `codigoP`, ni alias, ni nombres de proveedores: el dominio ya
 * lo garantiza y aca no se agrega nada que no venga del agregado. La columna es
 * **volumen movido**, no un saldo: una salida sube el volumen, no lo baja.
 */
import { useMemo } from 'react';

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

export function ReportePantalla({ movimientos, periodo, ollas }: ReportePantallaProps) {
  // El agregado solo depende de sus entradas: no se recalcula en cada render.
  const { categorias, filas } = useMemo(
    () => agregadoEntreOllas(movimientos, periodo, ollas),
    [movimientos, periodo, ollas],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Reporte entre ollas</h2>
        <p className="text-gray-600">
          Volumen movido por categoría del {periodo.desde} al {periodo.hasta}. Sin datos personales.
        </p>
      </div>

      {categorias.length === 0 ? (
        <p className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          No hay movimientos en este período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left" data-reporte="entre-ollas">
            <thead>
              <tr>
                <th scope="col" className="border-b border-gray-300 p-2">
                  Categoría
                </th>
                {filas.map((fila) => (
                  <th
                    key={fila.ollaId}
                    scope="col"
                    className="border-b border-gray-300 p-2"
                    data-olla={fila.ollaId}
                  >
                    {fila.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categorias.map((categoria) => (
                <tr key={categoria}>
                  <th scope="row" className="p-2 font-semibold">
                    {categoria}
                  </th>
                  {filas.map((fila) => (
                    <td key={fila.ollaId} className="p-2" data-categoria={categoria}>
                      {fila.volumen[categoria] ?? 0}
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
