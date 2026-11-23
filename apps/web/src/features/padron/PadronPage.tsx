import { type FormEvent, useEffect, useState } from 'react';

import { personaSchema } from '@hackods/contracts';
import { BotonGrande } from '@hackods/ui';

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
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Padrón</h2>
        <p className="text-gray-600">
          Se guarda un código P-XXXX. No se piden nombres, documentos ni teléfonos.
        </p>
      </div>

      {cantidad === null ? (
        <p role="status" className="text-gray-600">
          Leyendo el padrón guardado en este dispositivo…
        </p>
      ) : cantidad === 0 ? (
        <p className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          Todavía no hay personas en esta olla. La primera alta queda solo en el dispositivo.
        </p>
      ) : (
        <p className="text-gray-600">
          {cantidad} {cantidad === 1 ? 'persona registrada' : 'personas registradas'} en este
          dispositivo.
        </p>
      )}

      {codigoRecienCreado !== null ? (
        <div
          role="status"
          className="rounded-lg border border-gray-300 bg-gray-50 p-4"
          data-estado="pendiente-de-sincronizar"
        >
          <p className="text-lg font-semibold">Alta guardada: {codigoRecienCreado}</p>
          <p className="text-gray-600">
            Pendiente de sincronizar. Anotá el código en el papel del comedor.
          </p>
        </div>
      ) : null}

      <form onSubmit={enviar} className="flex flex-col gap-3" aria-label="Alta de persona">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Año de nacimiento</span>
          <input
            name="anioNacimiento"
            inputMode="numeric"
            value={formulario.anioNacimiento}
            onChange={(e) => cambiar('anioNacimiento', e.target.value)}
            className="rounded border border-gray-400 p-2"
            aria-describedby={error === null ? undefined : 'error-padron'}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Sexo</span>
          <select
            name="sexo"
            value={formulario.sexo}
            onChange={(e) => cambiar('sexo', e.target.value as Formulario['sexo'])}
            className="rounded border border-gray-400 p-2"
          >
            <option value="F">F</option>
            <option value="M">M</option>
            <option value="X">X</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Grupo</span>
          <select
            name="categoria"
            value={formulario.categoria}
            onChange={(e) => cambiar('categoria', e.target.value as Formulario['categoria'])}
            className="rounded border border-gray-400 p-2"
          >
            <option value="adulto">Adulto</option>
            <option value="adulto_mayor">Adulto mayor</option>
            <option value="nino">Niño o niña</option>
            <option value="gestante">Gestante</option>
            <option value="lactante">Lactante</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Alias (opcional, solo en este dispositivo)</span>
          <input
            name="alias"
            value={formulario.alias}
            onChange={(e) => cambiar('alias', e.target.value)}
            className="rounded border border-gray-400 p-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-semibold">Nombre local (opcional, solo en este dispositivo)</span>
          <input
            name="nombreLocal"
            value={formulario.nombreLocal}
            onChange={(e) => cambiar('nombreLocal', e.target.value)}
            className="rounded border border-gray-400 p-2"
          />
        </label>

        {error !== null ? (
          <p id="error-padron" role="alert" className="font-semibold">
            {error}
          </p>
        ) : null}

        <div>
          <BotonGrande disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar alta'}
          </BotonGrande>
        </div>
      </form>
    </section>
  );
}
