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
 * Presentacion movil: "Disponible" es la cifra heroe (lo que se viene a ver) y
 * el detalle va debajo en filas etiqueta/valor grandes, no en una tabla de
 * escritorio. Los cuatro estados se distinguen por texto y color.
 */
import type { Centimos, MovimientoPresupuesto } from '@hackods/contracts';
import { BotonGrande, EstadoPantalla } from '@hackods/ui';

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
        <h2 className="text-xl font-bold">Presupuesto de la olla</h2>
        <EstadoPantalla estado="cargando">Cargando presupuesto…</EstadoPantalla>
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Presupuesto de la olla</h2>
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
  const restoDeFilas = filas(resultado).filter((fila) => fila.etiqueta !== 'Disponible');

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Presupuesto de la olla</h2>
        <p className="text-sm text-texto-suave">
          Período {corte.periodoDesde} a {corte.periodoHasta}
        </p>
      </header>

      {estado === 'sin-conexion' && (
        <EstadoPantalla estado="sin-conexion" accion={<span className="oc-pendiente">pendiente de sincronizar</span>}>
          Se muestra lo último guardado en el teléfono.
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

      {/* Lo que se viene a ver: cuanto queda. */}
      <section className="oc-tarjeta flex flex-col gap-1" aria-label="Disponible">
        <span className="text-sm font-semibold text-texto-suave">
          Disponible
          <span className="block text-xs font-normal">
            {resultado.disponible < 0 ? 'excedido' : 'lo que queda libre'}
          </span>
        </span>
        <p className={`oc-cifra ${resultado.disponible < 0 ? 'text-error' : 'text-primario'}`}>
          {formatearCentimos(resultado.disponible)}
        </p>
      </section>

      <section aria-label="Resumen del presupuesto" className="oc-tarjeta flex flex-col divide-y divide-borde">
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
        <div className="flex items-baseline justify-between gap-3 py-3">
          <span className="font-semibold">
            Consumo
            <span className="block text-xs font-normal text-texto-suave">
              gastado + comprometido sobre asignado
            </span>
          </span>
          <span className="text-lg font-bold tabular-nums">
            {resultado.consumoBp === null ? (
              <span className="text-base font-normal text-texto-suave">sin dato</span>
            ) : (
              formatearPuntosBase(resultado.consumoBp)
            )}
          </span>
        </div>
      </section>
    </section>
  );
}
