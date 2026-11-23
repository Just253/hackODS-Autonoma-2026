/**
 * Pantalla de presupuesto de la olla (issue #10, D8 / DEC-2026-0008).
 *
 * Solo muestra. El calculo es `calcularPresupuesto` de `@hackods/domain`; esta
 * capa traduce ese resultado a textos y formatea centimos enteros. Nunca hace
 * cuentas de dinero: si el numero no viene del dominio, no se muestra.
 *
 * Los umbrales (80 % / 100 %) NO se repiten aca: se derivan de
 * `resultado.alertas` (`presupuesto_80` / `presupuesto_100`). Si el dominio
 * mueve su umbral, la pantalla lo sigue sin tocarse (apps/web/AGENTS.md §5).
 */
import type { Centimos, MovimientoPresupuesto } from '@hackods/contracts';
import { BotonGrande } from '@hackods/ui';

import { calcularPresupuesto, type CortePresupuesto, type ResultadoPresupuesto } from './dominio';
import { formatearCentimos, formatearPuntosBase } from './formato';

export type EstadoPantalla = 'listo' | 'cargando' | 'error' | 'sin-conexion';

export interface PresupuestoPantallaProps {
  readonly movimientos: readonly MovimientoPresupuesto[];
  readonly corte: CortePresupuesto;
  readonly estado?: EstadoPantalla;
  readonly onReintentar?: () => void;
}

interface FilaPresupuesto {
  readonly etiqueta: string;
  readonly valor: Centimos | null;
  readonly nota: string;
}

function filas(resultado: ResultadoPresupuesto): readonly FilaPresupuesto[] {
  return [
    { etiqueta: 'Asignado', valor: resultado.asignado, nota: 'dinero del período' },
    { etiqueta: 'Gastado', valor: resultado.gastado, nota: 'comprobantes asentados' },
    {
      etiqueta: 'Comprometido',
      valor: resultado.comprometido,
      nota: 'compras programadas',
    },
    {
      etiqueta: 'Disponible',
      valor: resultado.disponible,
      nota: resultado.disponible < 0 ? 'excedido' : 'lo que queda libre',
    },
    {
      etiqueta: 'Proyección al cierre',
      // MEDIA 5: sin base suficiente no hay cifra; `null` viaja hasta aca y se
      // muestra "sin dato". Mostrar el numero contradiria el aviso.
      valor: resultado.muestraInsuficiente ? null : resultado.proyeccionCentimos,
      nota: resultado.muestraInsuficiente
        ? 'muestra insuficiente (menos de 3 días): sin dato'
        : 'estimación lineal, no un pronóstico',
    },
  ];
}

interface AvisoAlerta {
  readonly tono: 'atencion' | 'critica';
  readonly texto: string;
}

/**
 * Alerta visible y no bloqueante: solo informa, no tapa la pantalla.
 *
 * El umbral sale del dominio: cada alerta trae `tipo` y `severidad`. Aca no se
 * compara ningun numero de puntos base.
 */
function avisos(resultado: ResultadoPresupuesto): readonly AvisoAlerta[] {
  const lista: AvisoAlerta[] = [];

  for (const alerta of resultado.alertas) {
    if (alerta.tipo === 'presupuesto_80') {
      lista.push({
        tono: 'atencion',
        texto:
          resultado.consumoBp === null
            ? 'Pasaste el 80 % del presupuesto del período.'
            : `Pasaste el 80 % del presupuesto del período. Consumo: ${formatearPuntosBase(resultado.consumoBp)}.`,
      });
    } else if (alerta.tipo === 'presupuesto_100') {
      lista.push({
        tono: 'critica',
        texto:
          resultado.consumoBp === null
            ? 'Usaste todo el presupuesto del período.'
            : `Usaste todo el presupuesto del período. Consumo: ${formatearPuntosBase(resultado.consumoBp)}.`,
      });
    } else if (alerta.tipo === 'proyeccion_excede') {
      lista.push({
        tono: 'atencion',
        texto: 'Al ritmo actual, la proyección al cierre supera lo asignado.',
      });
    }
  }

  // Disponible negativo es un hecho aritmetico del resultado, no un umbral.
  if (resultado.disponible < 0) {
    lista.push({
      tono: 'critica',
      texto: `Gastaste ${formatearCentimos(resultado.disponible)} más de lo asignado.`,
    });
  }
  return lista;
}

function Cargando() {
  return (
    <p className="text-gray-600" role="status">
      Cargando presupuesto…
    </p>
  );
}

function SinConexion() {
  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4" role="status" data-estado="sin-conexion">
      <strong>Sin conexión.</strong> Se muestra lo último guardado en el teléfono.
      <br />
      <span className="rounded bg-gray-200 px-2 py-1 text-sm">pendiente de sincronizar</span>
    </div>
  );
}

function Error({ onReintentar }: { readonly onReintentar?: () => void }) {
  return (
    <div className="rounded-lg border border-red-400 bg-red-50 p-4" role="alert">
      No se pudo calcular el presupuesto con los datos guardados.
      {onReintentar !== undefined && (
        <div className="mt-2">
          <BotonGrande variante="secundario" onClick={onReintentar}>
            Reintentar
          </BotonGrande>
        </div>
      )}
    </div>
  );
}

/** MEDIA 4: esto se pinta dentro del <main> de Shell; va como <section>. */
export function PresupuestoPantalla({
  movimientos,
  corte,
  estado = 'listo',
  onReintentar,
}: PresupuestoPantallaProps) {
  if (estado === 'cargando') {
    return (
      <section className="flex flex-col gap-4" aria-busy="true">
        <h2 className="text-2xl font-bold">Presupuesto de la olla</h2>
        <Cargando />
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Presupuesto de la olla</h2>
        <Error onReintentar={onReintentar} />
      </section>
    );
  }

  const resultado = calcularPresupuesto(movimientos, corte);
  const listaAvisos = avisos(resultado);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Presupuesto de la olla</h2>
        <p className="text-gray-600">
          Período {corte.periodoDesde} a {corte.periodoHasta}
        </p>
      </header>

      {estado === 'sin-conexion' && <SinConexion />}

      {listaAvisos.length > 0 && (
        <div className="flex flex-col gap-2" aria-live="polite" aria-label="Alertas de presupuesto">
          {listaAvisos.map((aviso) => (
            <p
              key={aviso.texto}
              className={
                aviso.tono === 'critica'
                  ? 'rounded-lg border border-red-400 bg-red-50 p-4'
                  : 'rounded-lg border border-amber-400 bg-amber-50 p-4'
              }
              data-tono={aviso.tono}
            >
              {aviso.texto}
            </p>
          ))}
        </div>
      )}

      <section aria-label="Resumen del presupuesto">
        <table className="w-full border-collapse text-left">
          <tbody>
            {filas(resultado).map((fila) => (
              <tr key={fila.etiqueta} className="border-b border-gray-200">
                <th scope="row" className="py-2 pr-4 font-normal">
                  {fila.etiqueta}
                  <small className="block text-gray-600">{fila.nota}</small>
                </th>
                <td className="py-2 text-right tabular-nums">
                  {fila.valor === null ? (
                    <span className="text-gray-600">sin dato</span>
                  ) : (
                    formatearCentimos(fila.valor)
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 pr-4 font-normal">
                Consumo
                <small className="block text-gray-600">gastado + comprometido sobre asignado</small>
              </th>
              <td className="py-2 text-right tabular-nums">
                {resultado.consumoBp === null ? (
                  <span className="text-gray-600">sin dato</span>
                ) : (
                  formatearPuntosBase(resultado.consumoBp)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>
  );
}