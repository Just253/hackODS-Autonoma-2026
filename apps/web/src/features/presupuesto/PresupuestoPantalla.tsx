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
 *
 * Distribucion: "Disponible" es la cifra heroe (lo que se viene a ver) y el
 * consumo se dibuja con una barra ademas del porcentaje: el color solo no
 * alcanza. En el telefono todo va en una columna; en escritorio el detalle
 * (asignado, gastado, comprometido, proyeccion) pasa a la segunda columna y
 * deja de ser una lista larga.
 *
 * Nota: los nombres de clase de esta pantalla evitan decimales a proposito; un
 * test compara el HTML contra `/\d+\.\d+/` para probar que no hay centimos
 * flotantes sueltos.
 */
import type { Centimos, MovimientoPresupuesto } from '@hackods/contracts';
import { BotonGrande, CifraDestacada, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

import { formatearRango } from '../../app/fechas.js';
import { calcularPresupuesto, type CortePresupuesto, type ResultadoPresupuesto } from './dominio';
import { formatearCentimos, formatearPuntosBase } from './formato';

export type EstadoPantallaPresupuesto = 'listo' | 'cargando' | 'error' | 'sin-conexion';

export interface PresupuestoPantallaProps {
  readonly movimientos: readonly MovimientoPresupuesto[];
  readonly corte: CortePresupuesto;
  readonly estado?: EstadoPantallaPresupuesto;
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
      etiqueta: 'Proyección al cierre',
      // MEDIA 5: sin base suficiente no hay cifra; `null` viaja hasta aca y se
      // muestra "sin dato". Mostrar el numero contradiria el aviso.
      valor: resultado.muestraInsuficiente ? null : resultado.proyeccionCentimos,
      nota: resultado.muestraInsuficiente
        ? 'sin dato — hacen falta al menos 3 días'
        : 'a este ritmo, cuánto se gastaría',
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
        <EncabezadoPantalla titulo="Presupuesto de la olla" />
        <EstadoPantalla estado="cargando">Cargando presupuesto…</EstadoPantalla>
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <EncabezadoPantalla titulo="Presupuesto de la olla" />
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
          No se pudo calcular el presupuesto con los datos guardados.
        </EstadoPantalla>
      </section>
    );
  }

  const resultado = calcularPresupuesto(movimientos, corte);
  const listaAvisos = avisos(resultado);
  const restoDeFilas = filas(resultado);
  const consumoEntero =
    resultado.consumoBp === null ? null : Math.min(100, Math.round(resultado.consumoBp / 100));

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Presupuesto de la olla"
        descripcion={formatearRango(corte.periodoDesde, corte.periodoHasta)}
      />

      {estado === 'sin-conexion' && (
        <EstadoPantalla estado="sin-conexion">
          Se muestra lo último guardado en esta tablet. Todavía no se envía a ninguna parte.
        </EstadoPantalla>
      )}

      {listaAvisos.length > 0 && (
        <div className="flex flex-col gap-2" aria-live="polite" aria-label="Alertas de presupuesto">
          {listaAvisos.map((aviso) => (
            <div
              key={aviso.texto}
              className="oc-estado"
              data-estado={aviso.tono === 'critica' ? 'error' : 'alerta'}
              data-tono={aviso.tono}
              role="status"
            >
              <span className="oc-estado__etiqueta">
                {aviso.tono === 'critica' ? 'Alerta' : 'Atención'}
              </span>
              <p>{aviso.texto}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {/* Lo que se viene a ver: cuanto queda. */}
          <CifraDestacada
            etiqueta="Disponible"
            nota={resultado.disponible < 0 ? 'excedido' : 'lo que queda libre'}
            tono={resultado.disponible < 0 ? 'error' : 'primario'}
          >
            {formatearCentimos(resultado.disponible)}
          </CifraDestacada>

          <section className="oc-tarjeta flex flex-col gap-2" aria-label="Consumo del período">
            <p className="text-sm font-semibold text-texto-suave">
              Consumo del mes
              <span className="block text-xs font-normal">
                {consumoEntero === null
                  ? 'sin dato — todavía no hay dinero asignado'
                  : `De cada S/ 100 del mes ya están usados S/ ${consumoEntero}.`}
              </span>
            </p>
            <p className="text-2xl font-bold tabular-nums">
              {resultado.consumoBp === null ? (
                <span className="text-base font-normal text-texto-suave">sin dato</span>
              ) : (
                formatearPuntosBase(resultado.consumoBp)
              )}
            </p>
            {consumoEntero === null ? null : (
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-tenue"
                role="progressbar"
                aria-label="Consumo del presupuesto"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={consumoEntero}
              >
                <div
                  className={
                    consumoEntero >= 100
                      ? 'h-full rounded-full bg-error'
                      : consumoEntero >= 80
                        ? 'h-full rounded-full bg-alerta'
                        : 'h-full rounded-full bg-primario'
                  }
                  style={{ width: `${consumoEntero}%` }}
                />
              </div>
            )}
          </section>
        </div>

        <section
          aria-label="Resumen del presupuesto"
          className="oc-tarjeta flex flex-col divide-y divide-borde"
        >
          {restoDeFilas.map((fila) => (
            <div key={fila.etiqueta} className="flex items-baseline justify-between gap-3 py-3">
              <span className="font-semibold">
                {fila.etiqueta}
                <span className="block text-xs font-normal text-texto-suave">{fila.nota}</span>
              </span>
              <span className="text-lg font-bold tabular-nums">
                {fila.valor === null ? (
                  <span className="text-base font-normal text-texto-suave">sin dato</span>
                ) : (
                  formatearCentimos(fila.valor)
                )}
              </span>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}
