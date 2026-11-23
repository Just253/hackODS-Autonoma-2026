import { useEffect, useState } from 'react';

import type { GrupoEtario, UnidadBase } from '@hackods/contracts';
import {
  aplicarSustituciones,
  costoDeReceta,
  explotarIngredientes,
  faltantesDeDespensa,
  sustitucionesParaFaltantes,
  type ComensalesPorGrupo,
  type ServicioDeReceta,
  type SustitucionAprobada,
} from '@hackods/domain';
import { BotonGrande, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

import { useSesion } from '../../app/sesion.js';
import { avisarCambioLocal } from '../../app/sync.js';
import {
  asegurarEntradasDemo,
  producirServicio,
  stockDeDespensa,
  type RelojRecetas,
} from '../../data/recetas-repo.js';
import { FUENTE_PRECIOS_DEMO, PRODUCTOS_DEMO } from '../../fixtures/precios-productos.js';
import {
  GRUPOS_DEMO,
  INSUMOS_DEMO,
  PORCIONES_FIRMADAS_DEMO,
  RECETAS_DEMO,
  RECETA_INICIAL,
  SUSTITUCIONES_DEMO,
} from '../../fixtures/recetas-demo.js';
import {
  formatearFactor,
  formatearGramos,
  formatearPrecioSoles,
  preciosDesdeProductos,
  textoPrecioVenta,
} from './dominio.js';

/**
 * Recetario -> menu del dia -> producir.
 *
 * La pantalla no calcula nada: llamadas puras de `@hackods/domain` sobre los
 * comensales que se eligen. Producir escribe movimientos de salida append-only
 * en Dexie y el stock se vuelve a derivar; nunca hay un saldo mutable.
 *
 * Estados: leyendo la despensa / sin comensales / faltante con sustituto /
 * faltante sin sustituto / pendiente de 75 °C / servicio registrado offline.
 */

const RELOJ: RelojRecetas = {
  ahora: () => new Date().toISOString(),
  idEvento: () => crypto.randomUUID(),
};

const PRECIOS = preciosDesdeProductos(PRODUCTOS_DEMO, INSUMOS_DEMO);
const INSUMO_POR_ID = new Map(INSUMOS_DEMO.map((insumo) => [insumo.id, insumo] as const));

function nombreDe(insumoId: string): string {
  return INSUMO_POR_ID.get(insumoId)?.nombre ?? 'Insumo sin nombre';
}

function unidadDe(insumoId: string): UnidadBase {
  return INSUMO_POR_ID.get(insumoId)?.unidadBase ?? 'g';
}

interface DecisionSustitucion {
  readonly tipo: 'sustitucion';
  readonly sustitucion: SustitucionAprobada;
}

interface DecisionCompra {
  readonly tipo: 'comprar';
}

type Decision = DecisionSustitucion | DecisionCompra;
type Decisiones = Readonly<Record<string, Decision | undefined>>;

export function RecetasPage() {
  const { sesion } = useSesion();
  const [recetaId, setRecetaId] = useState(RECETA_INICIAL);
  const [comensales, setComensales] = useState<ComensalesPorGrupo>({ adulto: 2 });
  const [decisiones, setDecisiones] = useState<Decisiones>({});
  const [cocidoA75C, setCocidoA75C] = useState(false);
  const [stock, setStock] = useState<Readonly<Record<string, number>> | null>(null);
  const [registrado, setRegistrado] = useState<ServicioDeReceta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    asegurarEntradasDemo(RELOJ, sesion.ollaId)
      .then(() => stockDeDespensa(sesion.ollaId))
      .then((saldo) => {
        if (vigente) setStock(saldo);
      })
      .catch(() => {
        if (vigente) setError('No se pudo leer la despensa de este dispositivo.');
      });
    return () => {
      vigente = false;
    };
  }, [sesion.ollaId]);

  const receta = RECETAS_DEMO.find((candidata) => candidata.id === recetaId) ?? RECETAS_DEMO[0]!;

  const explosion = explotarIngredientes(receta, comensales, PORCIONES_FIRMADAS_DEMO);
  const saldo = stock ?? {};
  const faltantes = faltantesDeDespensa(explosion.necesidades, saldo);
  const opciones = sustitucionesParaFaltantes(faltantes, SUSTITUCIONES_DEMO);
  const elegidas = opciones.flatMap((opcion) => {
    const decision = decisiones[opcion.faltante.insumoId];
    return decision?.tipo === 'sustitucion' ? [decision.sustitucion] : [];
  });
  const finales = aplicarSustituciones(explosion.necesidades, elegidas);
  const costo = costoDeReceta(finales.requerimientos, PRECIOS, explosion.totalComensales);
  const faltantesFinales = faltantesDeDespensa(finales.requerimientos, saldo);
  const sustitutosCortos = faltantesFinales.filter((faltante) =>
    elegidas.some((elegida) => elegida.insumoDestinoId === faltante.insumoId),
  );
  const faltanDecisiones = opciones.filter(
    (opcion) => decisiones[opcion.faltante.insumoId] === undefined,
  );

  const puedeRegistrar =
    stock !== null &&
    !guardando &&
    explosion.totalComensales > 0 &&
    faltanDecisiones.length === 0 &&
    sustitutosCortos.length === 0 &&
    cocidoA75C;

  const cambiarReceta = (id: string): void => {
    setRecetaId(id);
    setDecisiones({});
    setRegistrado(null);
    setCocidoA75C(false);
    setError(null);
  };

  const cambiarComensales = (grupo: GrupoEtario, valor: string): void => {
    const numero = Number(valor);
    const cantidad =
      Number.isFinite(numero) && numero > 0 ? Math.min(99, Math.trunc(numero)) : 0;
    setComensales((anteriores) => ({ ...anteriores, [grupo]: cantidad }));
    setDecisiones({});
    setRegistrado(null);
    setCocidoA75C(false);
  };

  const elegirSustitucion = (insumoId: string, sustitucion: SustitucionAprobada): void => {
    setDecisiones((anteriores) => ({
      ...anteriores,
      [insumoId]: { tipo: 'sustitucion', sustitucion },
    }));
    setRegistrado(null);
  };

  const elegirCompra = (insumoId: string): void => {
    setDecisiones((anteriores) => ({ ...anteriores, [insumoId]: { tipo: 'comprar' } }));
    setRegistrado(null);
  };

  const registrar = (): void => {
    setGuardando(true);
    setError(null);

    producirServicio(
      {
        recetaId: receta.id,
        recetaTitulo: receta.titulo,
        tipo: 'almuerzo',
        comensalesPorGrupo: comensales,
        totalComensales: explosion.totalComensales,
        // `memberId` ficticio de la sesion demo; nunca un nombre real (D2).
        cocinero: sesion.memberId,
        rolCocinero: sesion.rol,
        cocidoA75C,
        costo: {
          totalMicro: costo.totalMicro,
          porRacionMicro: costo.porRacionMicro,
          insumosSinPrecio: costo.insumosSinPrecio,
        },
        sustituciones: finales.aplicadas,
        requerimientos: finales.requerimientos,
      },
      RELOJ,
      sesion.ollaId,
    )
      .then(async ({ servicio }) => {
        const nuevoSaldo = await stockDeDespensa(sesion.ollaId);
        setStock(nuevoSaldo);
        setRegistrado(servicio);
        setDecisiones({});
        setCocidoA75C(false);
        avisarCambioLocal();
      })
      .catch(() => {
        setError('No se pudo registrar el servicio en el dispositivo. Intenta otra vez.');
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Recetario"
        descripcion="Elige el plato, cuenta quiénes comen y registra que se cocinó. Todo queda en esta tablet."
      />

      <p className="oc-tarjeta text-sm text-texto-suave" data-estado="sin-datos-reales">
        Los platos, el stock y los precios de esta pantalla no pertenecen a ninguna olla real.
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2" aria-label="Recetas de la olla">
            <h2 className="text-sm font-bold uppercase tracking-wide text-texto-suave">
              Recetas de la olla
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {RECETAS_DEMO.map((candidata) => (
                <li key={candidata.id}>
                  <button
                    type="button"
                    aria-pressed={candidata.id === receta.id}
                    onClick={() => cambiarReceta(candidata.id)}
                    className={`oc-tarjeta flex w-full flex-col gap-1 text-left ${
                      candidata.id === receta.id ? 'border-primario bg-primario-suave' : ''
                    }`}
                  >
                    <span className="text-base font-bold">{candidata.titulo}</span>
                    <span className="text-xs uppercase tracking-wide text-texto-suave">
                      {candidata.perfil === 'general'
                        ? 'Receta general'
                        : 'Receta para grupos vulnerables'}
                    </span>
                    <span className="flex flex-col gap-0.5 text-sm">
                      {candidata.ingredientes.map((ingrediente) => (
                        <span key={ingrediente.insumoId} className="flex justify-between gap-2">
                          <span>{nombreDe(ingrediente.insumoId)}</span>
                          <span className="font-mono">
                            {ingrediente.gramosPorPorcion === null
                              ? 'sin dato'
                              : `${formatearGramos(ingrediente.gramosPorPorcion)} por ración`}
                          </span>
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="oc-tarjeta flex flex-col gap-3" aria-label="Menú del día">
            <h2 className="text-lg font-bold">Menú del día</h2>
            <p className="text-sm text-texto-suave">
              Receta elegida: <strong className="text-texto">{receta.titulo}</strong>
            </p>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-bold">Comensales por grupo</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {GRUPOS_DEMO.map((grupo) => {
                  const firmada = PORCIONES_FIRMADAS_DEMO[grupo.grupo];
                  return (
                    <div key={grupo.grupo} className="flex flex-col gap-1">
                      <label className="flex flex-col gap-1">
                        <span className="text-sm">{grupo.etiqueta}</span>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          step="1"
                          inputMode="numeric"
                          aria-label={grupo.etiqueta}
                          value={comensales[grupo.grupo] ?? 0}
                          onChange={(evento) => cambiarComensales(grupo.grupo, evento.target.value)}
                          className="oc-campo"
                        />
                      </label>
                      <span className="text-xs text-texto-suave">
                        {firmada === undefined
                          ? `Sin porción firmada: se usa la base de ${formatearGramos(receta.porcionBaseGramos)}.`
                          : `Porción firmada: ${formatearGramos(firmada)}.`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm">
                Total: <strong>{explosion.totalComensales}</strong>{' '}
                {explosion.totalComensales === 1 ? 'comensal' : 'comensales'}.
              </p>
            </fieldset>
          </section>

          <section className="oc-tarjeta flex flex-col gap-2" aria-label="Despensa">
            <h2 className="text-sm font-bold uppercase tracking-wide text-texto-suave">
              Lo que hay en la despensa
            </h2>
            {stock === null ? (
              <EstadoPantalla estado="cargando">
                Leyendo la despensa guardada en este dispositivo…
              </EstadoPantalla>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {receta.ingredientes.map((ingrediente) => {
                  const disponible = saldo[ingrediente.insumoId] ?? 0;
                  return (
                    <li
                      key={ingrediente.insumoId}
                      data-testid={`stock-${ingrediente.insumoId}`}
                      data-valor={disponible}
                      className="flex justify-between gap-2"
                    >
                      <span>{nombreDe(ingrediente.insumoId)}</span>
                      <span className={`font-mono ${disponible < 0 ? 'text-error' : ''}`}>
                        {formatearGramos(disponible)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          {opciones.length > 0 ? (
            <section
              className="oc-tarjeta flex flex-col gap-3 border-alerta"
              aria-label="Falta en la despensa"
            >
              <h2 className="text-lg font-bold">Falta en la despensa</h2>
              <ul className="flex flex-col gap-3">
                {opciones.map((opcion) => {
                  const { faltante } = opcion;
                  const decision = decisiones[faltante.insumoId];
                  return (
                    <li
                      key={faltante.insumoId}
                      data-testid={`faltante-${faltante.insumoId}`}
                      className="flex flex-col gap-1"
                    >
                      <p className="text-sm">
                        <strong>{nombreDe(faltante.insumoId)}</strong>: necesitas{' '}
                        {formatearGramos(faltante.requerido)} y hay{' '}
                        {formatearGramos(faltante.disponible)}. Faltan{' '}
                        <strong>{formatearGramos(faltante.faltan)}</strong>.
                      </p>
                      <fieldset className="flex flex-col gap-1">
                        <legend className="text-xs uppercase tracking-wide text-texto-suave">
                          ¿Qué hacemos con {nombreDe(faltante.insumoId)}?
                        </legend>
                        {opcion.estado === 'sin sustituto' ? (
                          <p className="text-sm font-semibold">sin sustituto</p>
                        ) : null}
                        {opcion.sustituciones.map((sustitucion) => (
                          <label key={sustitucion.id} className="flex items-start gap-2 text-sm">
                            <input
                              type="radio"
                              name={`decision-${faltante.insumoId}`}
                              checked={
                                decision?.tipo === 'sustitucion' &&
                                decision.sustitucion.id === sustitucion.id
                              }
                              onChange={() => elegirSustitucion(faltante.insumoId, sustitucion)}
                            />
                            <span>
                              {nombreDe(sustitucion.insumoDestinoId)} · en proporción{' '}
                              {formatearFactor(sustitucion.factor)} · aprobada por la nutricionista
                            </span>
                          </label>
                        ))}
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="radio"
                            name={`decision-${faltante.insumoId}`}
                            checked={decision?.tipo === 'comprar'}
                            onChange={() => elegirCompra(faltante.insumoId)}
                          />
                          <span>Se compra antes de cocinar</span>
                        </label>
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-texto-suave">
                Nada se reemplaza solo: la sustitución queda registrada con quien la aprobó.
              </p>
            </section>
          ) : null}

          <section className="oc-tarjeta flex flex-col gap-2" aria-label="Costo del servicio">
            <h2 className="text-lg font-bold">Costo</h2>
            {explosion.totalComensales === 0 ? (
              <p className="text-sm text-texto-suave">Elige al menos un comensal para costear.</p>
            ) : (
              <>
                <ul className="flex flex-col gap-1 text-sm">
                  {costo.lineas.map((linea) => (
                    <li key={linea.insumoId} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {nombreDe(linea.insumoId)}{' '}
                        <span className="text-texto-suave">
                          · {formatearGramos(linea.gramos)} ·{' '}
                          {textoPrecioVenta(PRECIOS[linea.insumoId], unidadDe(linea.insumoId))}
                        </span>
                      </span>
                      <span className="font-mono">
                        {linea.costoMicro === null
                          ? 'sin dato'
                          : formatearPrecioSoles(linea.costoMicro)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="flex flex-wrap justify-between gap-2 text-base">
                  <span className="font-bold">Costo total</span>
                  <span data-testid="costo-total" className="font-mono font-bold">
                    {costo.totalMicro === null ? 'sin dato' : formatearPrecioSoles(costo.totalMicro)}
                  </span>
                </p>
                <p className="flex flex-wrap justify-between gap-2 text-base">
                  <span className="font-bold">Por ración</span>
                  <span data-testid="costo-por-racion" className="font-mono font-bold">
                    {costo.porRacionMicro === null
                      ? 'sin dato'
                      : formatearPrecioSoles(costo.porRacionMicro)}
                  </span>
                </p>
                {costo.totalMicro === null ? (
                  <p className="text-xs text-texto-suave">
                    Falta el precio de{' '}
                    {costo.insumosSinPrecio.map((insumoId) => nombreDe(insumoId)).join(', ')}. No
                    se completa con un promedio.
                  </p>
                ) : null}
                <p className="text-xs text-texto-suave">
                  Precio típico de la serie de precios de esta olla. {FUENTE_PRECIOS_DEMO}.
                </p>
              </>
            )}
          </section>

          <section className="oc-tarjeta flex flex-col gap-2" aria-label="Registrar servicio">
            <label className="flex items-start gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={cocidoA75C}
                onChange={(evento) => setCocidoA75C(evento.target.checked)}
              />
              <span>Confirmo que se cocinó a 75 °C</span>
            </label>

            {sustitutosCortos.length > 0 ? (
              <p className="text-sm text-error">
                El sustituto tampoco alcanza:{' '}
                {sustitutosCortos.map((faltante) => nombreDe(faltante.insumoId)).join(', ')}. Compra
                o elige otra opción.
              </p>
            ) : null}

            {faltanDecisiones.length > 0 ? (
              <p className="text-sm text-texto-suave">
                Falta decidir qué hacer con{' '}
                {faltanDecisiones
                  .map((opcion) => nombreDe(opcion.faltante.insumoId))
                  .join(', ')}
                .
              </p>
            ) : null}

            <div className="[&>button]:w-full">
              <BotonGrande disabled={!puedeRegistrar} onClick={registrar}>
                {guardando ? 'Registrando…' : 'Registrar servicio'}
              </BotonGrande>
            </div>
            <p className="text-xs text-texto-suave">
              Se descuenta una salida por ingrediente. El stock se calcula sumando los movimientos
              de la despensa.
            </p>
          </section>

          {error !== null ? <EstadoPantalla estado="error">{error}</EstadoPantalla> : null}

          {registrado !== null ? (
            <div
              role="status"
              className="oc-tarjeta flex flex-col gap-1 border-primario bg-primario-suave"
              data-estado="pendiente-de-sincronizar"
            >
              <p className="text-lg font-bold">Servicio registrado</p>
              <p className="text-sm">
                {registrado.recetaTitulo} · {registrado.totalComensales}{' '}
                {registrado.totalComensales === 1 ? 'comensal' : 'comensales'} · cocinó{' '}
                <span className="font-mono">{registrado.cocinero}</span> ({registrado.rolCocinero})
              </p>
              <p className="text-sm">
                Costo:{' '}
                <strong>
                  {registrado.costo.totalMicro === null
                    ? 'sin dato'
                    : formatearPrecioSoles(registrado.costo.totalMicro)}
                </strong>{' '}
                · Por ración:{' '}
                <strong>
                  {registrado.costo.porRacionMicro === null
                    ? 'sin dato'
                    : formatearPrecioSoles(registrado.costo.porRacionMicro)}
                </strong>
              </p>
              <p className="text-sm text-texto-suave">
                Guardado en esta tablet. La red no hizo falta.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
