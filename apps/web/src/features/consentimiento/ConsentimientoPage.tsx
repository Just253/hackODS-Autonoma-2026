import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { Persona } from '@hackods/contracts';
import {
  TIPOS_CONSENTIMIENTO,
  type EstadoConsentimiento,
  type TipoConsentimiento,
} from '@hackods/domain';
import { EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

import { formatearDia } from '../../app/fechas.js';
import { avisarCambioLocal } from '../../app/sync.js';
import {
  estadoDeConsentimiento,
  otorgarConsentimiento,
  revocarConsentimiento,
  type ConsentimientoConEstado,
} from '../../data/consentimiento-repo.js';
import { OLLA_DEMO, listarPersonas } from '../../data/repositorio.js';

/**
 * Consentimiento (#74): dos permisos separados del plato.
 *
 * El informe (Despensa Solidaria, Anexo A) pide dos casillas distintas, texto
 * sin jerga y una revocación que gane. La pantalla no "sabe" nada del permiso:
 * guarda con `data/consentimiento-repo` y lee el estado de Dexie, así que
 * revocar corta el seguimiento al instante aunque no haya red. El evento viaja
 * por el outbox cuando haya señal y el badge del cascarón lo cuenta.
 *
 * Se entra desde "Más" (y desde el padrón se llega por el código P-XXXX que se
 * anotó en el papel del comedor). No hay nombres: la persona es su código (D2).
 */

/** Lo que se lee en la casilla, en palabras y no en jerga. */
const TEXTO_PERMISO: Record<TipoConsentimiento, { titulo: string; detalle: string }> = {
  seguimiento: {
    titulo: 'Seguimiento de salud',
    detalle:
      'Permite anotar su peso, su talla y si tiene anemia, para acompañarla mejor. Si dice que no, la olla la sigue atendiendo igual.',
  },
  estadisticas: {
    titulo: 'Estadísticas',
    detalle:
      'Permite sumar sus datos, sin su nombre, a los conteos por grupo de la olla. Nunca se muestra una persona sola: hacen falta al menos 10.',
  },
};

/** El estado tal como se ve, con la palabra (nunca solo un color). */
const TEXTO_ESTADO: Record<EstadoConsentimiento, string> = {
  otorgado: 'Otorgado',
  revocado: 'Revocado',
  sin_registro: 'Sin registro',
};

/** Texto de revocación: qué pasa y qué no pasa cuando se retira el permiso. */
const TEXTO_REVOCACION =
  'Puede retirar el permiso cuando quiera. La revocación se guarda al instante en esta tablet y se envía cuando haya señal. Si retira el seguimiento, dejamos de usar sus datos de salud; si retira las estadísticas, sus datos dejan de entrar en los conteos por grupo. El plato no se toca en ningún caso.';

export function ConsentimientoPage() {
  const [personas, setPersonas] = useState<readonly Persona[] | null>(null);
  const [codigoP, setCodigoP] = useState<string | null>(null);
  const [estados, setEstados] = useState<readonly ConsentimientoConEstado[] | null>(null);
  const [guardando, setGuardando] = useState<TipoConsentimiento | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    listarPersonas(OLLA_DEMO)
      .then((lista) => {
        if (!vigente) return;
        setPersonas(lista);
        setCodigoP((actual) => actual ?? lista[0]?.codigoP ?? null);
      })
      .catch(() => {
        if (vigente) setError('No se pudo leer el padrón de esta tablet.');
      });
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (codigoP === null) return;
    let vigente = true;
    estadoDeConsentimiento(codigoP, OLLA_DEMO)
      .then((nuevos) => {
        if (vigente) setEstados(nuevos);
      })
      .catch(() => {
        if (vigente) setError('No se pudo leer el consentimiento guardado en esta tablet.');
      });
    return () => {
      vigente = false;
    };
  }, [codigoP]);

  const firmar = (tipo: TipoConsentimiento, otorgado: boolean): void => {
    if (codigoP === null || guardando !== null) return;
    setError(null);
    setAviso(null);
    setGuardando(tipo);

    const accion = otorgado ? otorgarConsentimiento : revocarConsentimiento;
    accion(codigoP, tipo, undefined, OLLA_DEMO)
      .then(() => estadoDeConsentimiento(codigoP, OLLA_DEMO))
      .then((nuevos) => {
        setEstados(nuevos);
        setAviso(
          otorgado
            ? 'Permiso otorgado. Guardado en esta tablet; se envía cuando haya señal.'
            : 'Permiso revocado. El seguimiento se cortó en esta tablet y se envía cuando haya señal.',
        );
        avisarCambioLocal();
      })
      .catch(() => {
        setError('No se pudo guardar el consentimiento en esta tablet. Intenta otra vez.');
      })
      .finally(() => {
        setGuardando(null);
      });
  };

  const estadoDe = (tipo: TipoConsentimiento): ConsentimientoConEstado | undefined =>
    estados?.find((e) => e.tipo === tipo);

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Consentimiento"
        descripcion="Dos permisos distintos, cada uno se da o se retira por separado. Decir que no no le quita el plato a nadie."
      />

      {error !== null ? (
        <div id="error-consentimiento">
          <EstadoPantalla estado="error">{error}</EstadoPantalla>
        </div>
      ) : null}

      {personas === null ? (
        <EstadoPantalla estado="cargando">Leyendo el padrón de esta tablet…</EstadoPantalla>
      ) : personas.length === 0 ? (
        <div className="oc-tarjeta flex flex-col gap-2" data-estado="vacio">
          <p className="text-lg font-bold">Todavía no hay personas en el padrón</p>
          <p className="text-sm text-texto-suave">
            El consentimiento se firma sobre una persona. Primero da de alta a alguien: se
            guarda un código para esa persona, sin nombres ni documentos.
          </p>
          <Link className="oc-boton oc-boton--secundario w-fit" to="/padron">
            Ir al padrón
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:gap-6">
          <label className="flex max-w-[var(--ancho-lectura)] flex-col gap-1">
            <span className="text-sm font-semibold">Persona</span>
            <span className="text-xs text-texto-suave">
              Solo el código que está anotado en el papel del comedor.
            </span>
            <select
              name="persona"
              value={codigoP ?? ''}
              onChange={(e) => {
                setAviso(null);
                setEstados(null);
                setCodigoP(e.target.value);
              }}
              className="oc-campo"
            >
              {personas.map((persona) => (
                <option key={persona.codigoP} value={persona.codigoP}>
                  {persona.codigoP}
                </option>
              ))}
            </select>
          </label>

          {estados === null ? (
            <EstadoPantalla estado="cargando">Leyendo los permisos de esta persona…</EstadoPantalla>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {TIPOS_CONSENTIMIENTO.map((tipo) => {
                const actual = estadoDe(tipo);
                const estado = actual?.estado ?? 'sin_registro';
                const otorgado = estado === 'otorgado';
                const registro = actual?.registro ?? null;
                const ocupado = guardando !== null;
                return (
                  <div key={tipo} className="oc-tarjeta flex flex-col gap-3" data-permiso={tipo}>
                    <div className="flex items-start gap-3">
                      <input
                        id={`consentimiento-${tipo}`}
                        type="checkbox"
                        className="mt-1 h-6 w-6 shrink-0"
                        checked={otorgado}
                        disabled={ocupado}
                        onChange={(e) => firmar(tipo, e.target.checked)}
                        aria-describedby={`consentimiento-${tipo}-detalle consentimiento-${tipo}-estado`}
                      />
                      <div className="flex min-w-0 flex-col gap-1">
                        <label htmlFor={`consentimiento-${tipo}`} className="text-lg font-bold">
                          {TEXTO_PERMISO[tipo].titulo}
                        </label>
                        <p id={`consentimiento-${tipo}-detalle`} className="text-sm text-texto-suave">
                          {TEXTO_PERMISO[tipo].detalle}
                        </p>
                      </div>
                    </div>

                    <p id={`consentimiento-${tipo}-estado`} data-estado={estado} className="text-sm">
                      Estado:{' '}
                      <strong
                        className={
                          estado === 'otorgado'
                            ? 'text-primario'
                            : estado === 'revocado'
                              ? 'text-pendiente'
                              : 'text-texto-suave'
                        }
                      >
                        {TEXTO_ESTADO[estado]}
                      </strong>
                      {registro === null
                        ? null
                        : estado === 'otorgado'
                          ? ` — firmó el ${formatearDia(registro.firmadoEn)}`
                          : ` — retiró el permiso el ${formatearDia(registro.firmadoEn)}`}
                    </p>

                    {otorgado ? (
                      <button
                        type="button"
                        className="oc-boton oc-boton--secundario w-fit"
                        disabled={ocupado}
                        onClick={() => firmar(tipo, false)}
                      >
                        {tipo === 'seguimiento'
                          ? 'Revocar el seguimiento'
                          : 'Revocar las estadísticas'}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {aviso !== null ? (
            <div
              role="status"
              data-estado="pendiente-de-sincronizar"
              className="oc-tarjeta border-primario bg-primario-suave text-sm"
            >
              {aviso}
            </div>
          ) : null}

          <div className="oc-tarjeta flex max-w-[var(--ancho-lectura)] flex-col gap-2">
            <p className="text-lg font-bold">Cómo se retira el permiso</p>
            <p className="text-sm text-texto-suave">{TEXTO_REVOCACION}</p>
          </div>
        </div>
      )}
    </section>
  );
}
