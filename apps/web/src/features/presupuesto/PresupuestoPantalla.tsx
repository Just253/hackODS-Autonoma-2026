/**
 * Pantalla de presupuesto de la olla (issue #10, D8 / DEC-2026-0008).
 *
 * Solo muestra. El calculo es `calcularPresupuesto` de `@hackods/domain`; esta
 * capa traduce ese resultado a textos y formatea centimos enteros. Nunca hace
 * cuentas de dinero: si el numero no viene del dominio, no se muestra.
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
      valor: resultado.proyeccionCentimos,
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

/** Alerta visible y no bloqueante: solo informa, no tapa la pantalla. */
function avisos(resultado: ResultadoPresupuesto): readonly AvisoAlerta[] {
  const lista: AvisoAlerta[] = [];
  const bp = resultado.consumoBp;

  if (bp !== null && bp >= 8_000) {
    const detalle =
      bp >= 10_000
        ? 'Usaste todo el presupuesto del período.'
        : 'Pasaste el 80 % del presupuesto del período.';
    lista.push({
      tono: bp >= 10_000 ? 'critica' : 'atencion',
      texto: `${detalle} Consumo: ${formatearPuntosBase(bp)}.`,
    });
  }
  if (resultado.alertas.some((alerta) => alerta.tipo === 'proyeccion_excede')) {
    lista.push({
      tono: 'atencion',
      texto: 'Al ritmo actual, la proyección al cierre supera lo asignado.',
    });
  }
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
    <p className="oc-aviso oc-aviso--tenue" role="status">
      Cargando presupuesto…
    </p>
  );
}

function SinConexion() {
  return (
    <div className="oc-aviso oc-aviso--tenue" role="status" data-estado="sin-conexion">
      <strong>Sin conexión.</strong> Se muestra lo último guardado en el teléfono.
      <br />
      <span className="oc-badge">pendiente de sincronizar</span>
    </div>
  );
}

function Error({ onReintentar }: { readonly onReintentar?: () => void }) {
  return (
    <div className="oc-aviso oc-aviso--critica" role="alert">
      No se pudo calcular el presupuesto con los datos guardados.
      {onReintentar !== undefined && (
        <div className="oc-accion">
          <BotonGrande variante="secundario" onClick={onReintentar}>
            Reintentar
          </BotonGrande>
        </div>
      )}
    </div>
  );
}

export function PresupuestoPantalla({
  movimientos,
  corte,
  estado = 'listo',
  onReintentar,
}: PresupuestoPantallaProps) {
  if (estado === 'cargando') {
    return (
      <main className="oc-pantalla" aria-busy="true">
        <h1 className="oc-titulo">Presupuesto de la olla</h1>
        <Cargando />
      </main>
    );
  }

  if (estado === 'error') {
    return (
      <main className="oc-pantalla">
        <h1 className="oc-titulo">Presupuesto de la olla</h1>
        <Error onReintentar={onReintentar} />
      </main>
    );
  }

  const resultado = calcularPresupuesto(movimientos, corte);
  const listaAvisos = avisos(resultado);

  return (
    <main className="oc-pantalla">
      <header className="oc-cabecera">
        <h1 className="oc-titulo">Presupuesto de la olla</h1>
        <p className="oc-tenue">
          Período {corte.periodoDesde} a {corte.periodoHasta}
        </p>
      </header>

      {estado === 'sin-conexion' && <SinConexion />}

      {listaAvisos.length > 0 && (
        <section className="oc-alertas" aria-live="polite" aria-label="Alertas de presupuesto">
          {listaAvisos.map((aviso) => (
            <p
              key={aviso.texto}
              className={`oc-aviso oc-aviso--${aviso.tono}`}
              data-tono={aviso.tono}
            >
              {aviso.texto}
            </p>
          ))}
        </section>
      )}

      <section aria-label="Resumen del presupuesto">
        <table className="oc-tabla">
          <tbody>
            {filas(resultado).map((fila) => (
              <tr key={fila.etiqueta}>
                <th scope="row">
                  {fila.etiqueta}
                  <small className="oc-tenue">{fila.nota}</small>
                </th>
                <td className="oc-num">
                  {fila.valor === null ? <span className="oc-tenue">sin dato</span> : formatearCentimos(fila.valor)}
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row">
                Consumo
                <small className="oc-tenue">gastado + comprometido sobre asignado</small>
              </th>
              <td className="oc-num">
                {resultado.consumoBp === null ? (
                  <span className="oc-tenue">sin dato</span>
                ) : (
                  formatearPuntosBase(resultado.consumoBp)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
