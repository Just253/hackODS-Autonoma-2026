import { type FormEvent, useEffect, useState } from 'react';

import { personaSchema } from '@hackods/contracts';
import { BotonGrande, EstadoPantalla } from '@hackods/ui';

import { avisarCambioLocal } from '../../app/sync.js';
import { OLLA_DEMO, altaPersona, contarPersonas } from '../../data/repositorio.js';

/**
 * Padron: alta de persona sin identidad.
 *
 * Lo que se muestra y viaja es `P-XXXX` (DEC-2026-0002). `nombreLocal` y
 * `alias` son opcionales, se guardan SOLO en la tabla `localOnly` de Dexie y
 * aqui no se listan: la pantalla del padron nunca los imprime.
 *
 * Estados: cargando / vacio / formulario invalido / error / pendiente de
 * sincronizar. Ninguno bloquea por red: el alta se guarda en el dispositivo.
 *
 * Presentacion movil: la cifra del padron arriba (lo primero que se mira al
 * llegar), un objetivo por pantalla y el boton grande al final del formulario,
 * al alcance del pulgar.
 */

interface Formulario {
  anioNacimiento: string;
  sexo: 'F' | 'M' | 'X';
  categoria: 'adulto' | 'adulto_mayor' | 'nino' | 'gestante' | 'lactante';
  alias: string;
  nombreLocal: string;
}

const FORMULARIO_VACIO: Formulario = {
  anioNacimiento: '',
  sexo: 'F',
  categoria: 'adulto',
  alias: '',
  nombreLocal: '',
};

/**
 * El rango válido es el del contrato (`personaSchema.anioNacimiento`), no una
 * copia en la pantalla: un año hardcodeado caduca solo y la pantalla empieza a
 * rechazar a quien el contrato acepta. El chequeo lo hace el propio schema; los
 * límites se leen de él únicamente para el texto del error.
 */
const ANIO_NACIMIENTO = personaSchema.shape.anioNacimiento;
const ANIO_MINIMO = ANIO_NACIMIENTO.minValue;
const ANIO_MAXIMO_AL_NACER = ANIO_NACIMIENTO.maxValue;

function mensajeDeAnioInvalido(): string {
  return ANIO_MINIMO !== null && ANIO_MAXIMO_AL_NACER !== null
    ? `Año de nacimiento: un año entre ${ANIO_MINIMO} y ${ANIO_MAXIMO_AL_NACER}.`
    : 'Año de nacimiento: el contrato no lo acepta.';
}

/** Clase unica de los campos: 56 px de alto, borde visible al sol. */
const CAMPO =
  'min-h-[56px] w-full rounded-oc border border-borde-fuerte bg-superficie px-3 py-2 text-base';

export function PadronPage() {
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [codigoRecienCreado, setCodigoRecienCreado] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    contarPersonas(OLLA_DEMO)
      .then((n) => {
        if (vigente) setCantidad(n);
      })
      .catch(() => {
        if (vigente) setError('No se pudo leer el padron del dispositivo.');
      });
    return () => {
      vigente = false;
    };
  }, []);

  const cambiar = <C extends keyof Formulario>(campo: C, valor: Formulario[C]): void => {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  };

  const enviar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setError(null);
    setCodigoRecienCreado(null);

    const anio = Number(formulario.anioNacimiento);
    if (!ANIO_NACIMIENTO.safeParse(anio).success) {
      setError(mensajeDeAnioInvalido());
      return;
    }

    setGuardando(true);
    altaPersona({
      anioNacimiento: anio,
      sexo: formulario.sexo,
      categoria: formulario.categoria,
      alias: formulario.alias.trim() === '' ? null : formulario.alias.trim(),
      nombreLocal:
        formulario.nombreLocal.trim() === '' ? null : formulario.nombreLocal.trim(),
    })
      .then(({ persona }) => {
        setCodigoRecienCreado(persona.codigoP);
        setFormulario(FORMULARIO_VACIO);
        setCantidad((n) => (n ?? 0) + 1);
        avisarCambioLocal();
      })
      .catch(() => {
        setError('No se pudo guardar el alta en el dispositivo. Intentá otra vez.');
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Padrón</h2>
        <p className="text-sm text-texto-suave">
          Se guarda un código P-XXXX. No se piden nombres, documentos ni teléfonos.
        </p>
      </header>

      {/* La cifra primero: "cuantas personas hay" es la pregunta de entrada. */}
      {cantidad === null ? (
        <EstadoPantalla estado="cargando">
          Leyendo el padrón guardado en este dispositivo…
        </EstadoPantalla>
      ) : cantidad === 0 ? (
        <div className="oc-tarjeta flex flex-col gap-1" data-estado="vacio">
          <span className="oc-estado__etiqueta text-texto-suave">Padrón vacío</span>
          <p>Todavía no hay personas en esta olla. La primera alta queda solo en el dispositivo.</p>
        </div>
      ) : (
        <div className="oc-tarjeta flex items-baseline justify-between gap-3">
          <p className="text-sm text-texto-suave">
            {cantidad === 1 ? 'persona registrada' : 'personas registradas'} en este dispositivo
          </p>
          <p className="oc-cifra" aria-label={`${cantidad} personas en el padrón`}>
            {cantidad}
          </p>
        </div>
      )}

      {codigoRecienCreado !== null ? (
        <div
          role="status"
          className="oc-tarjeta border-primario bg-primario-suave"
          data-estado="pendiente-de-sincronizar"
        >
          <p className="text-lg font-bold">Alta guardada: {codigoRecienCreado}</p>
          <p className="text-sm text-texto-suave">
            Pendiente de sincronizar. Anotá el código en el papel del comedor.
          </p>
        </div>
      ) : null}

      {error !== null ? (
        <div id="error-padron">
          <EstadoPantalla estado="error">{error}</EstadoPantalla>
        </div>
      ) : null}

      <form onSubmit={enviar} className="flex flex-col gap-3" aria-label="Alta de persona">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Año de nacimiento</span>
          <input
            name="anioNacimiento"
            inputMode="numeric"
            value={formulario.anioNacimiento}
            onChange={(e) => cambiar('anioNacimiento', e.target.value)}
            className={CAMPO}
            aria-describedby={error === null ? undefined : 'error-padron'}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Sexo</span>
          <select
            name="sexo"
            value={formulario.sexo}
            onChange={(e) => cambiar('sexo', e.target.value as Formulario['sexo'])}
            className={CAMPO}
          >
            <option value="F">F</option>
            <option value="M">M</option>
            <option value="X">X</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Grupo</span>
          <select
            name="categoria"
            value={formulario.categoria}
            onChange={(e) => cambiar('categoria', e.target.value as Formulario['categoria'])}
            className={CAMPO}
          >
            <option value="adulto">Adulto</option>
            <option value="adulto_mayor">Adulto mayor</option>
            <option value="nino">Niño o niña</option>
            <option value="gestante">Gestante</option>
            <option value="lactante">Lactante</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Alias (opcional, solo en este dispositivo)</span>
          <input
            name="alias"
            value={formulario.alias}
            onChange={(e) => cambiar('alias', e.target.value)}
            className={CAMPO}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">
            Nombre local (opcional, solo en este dispositivo)
          </span>
          <input
            name="nombreLocal"
            value={formulario.nombreLocal}
            onChange={(e) => cambiar('nombreLocal', e.target.value)}
            className={CAMPO}
          />
        </label>

        {/* El boton ocupa el ancho: es LA accion de esta pantalla. */}
        <div className="sticky bottom-0 -mx-4 bg-fondo/95 px-4 py-3 backdrop-blur">
          <BotonGrande disabled={guardando} type="submit">
            {guardando ? 'Guardando…' : 'Guardar alta'}
          </BotonGrande>
        </div>
      </form>
    </section>
  );
}
