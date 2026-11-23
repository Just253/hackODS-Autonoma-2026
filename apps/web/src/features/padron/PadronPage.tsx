import { type FormEvent, useEffect, useState } from 'react';

import { personaSchema } from '@hackods/contracts';
import { BotonGrande, CifraDestacada, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

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
 * Distribucion: en el telefono la cifra va arriba (lo primero que se mira al
 * llegar) y el formulario debajo, con el boton grande al final. En escritorio
 * sobra ancho: el resumen se queda a la izquierda y el formulario a la derecha,
 * con los campos cortos en dos columnas. El boton ya no es `sticky`: con la
 * barra inferior flotaba sobre el ultimo campo.
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

/** Etiqueta de un campo: texto arriba, control debajo. Un solo tamano. */
const ETIQUETA = 'text-sm font-semibold';

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
        if (vigente) setError('No se pudo leer el padrón del dispositivo.');
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
        setError('No se pudo guardar el alta en el dispositivo. Intenta otra vez.');
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Padrón"
        descripcion="Se guarda un código P-XXXX. No se piden nombres, documentos ni teléfonos."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {/* La cifra primero: "cuantas personas hay" es la pregunta de entrada. */}
          {cantidad === null ? (
            <EstadoPantalla estado="cargando">
              Leyendo el padrón guardado en este dispositivo…
            </EstadoPantalla>
          ) : cantidad === 0 ? (
            <div className="oc-tarjeta flex flex-col gap-1" data-estado="vacio">
              <span className="oc-estado__etiqueta text-texto-suave">Padrón vacío</span>
              <p>
                Todavía no hay personas en esta olla. La primera alta queda solo en el dispositivo.
              </p>
            </div>
          ) : (
            <CifraDestacada
              etiqueta={cantidad === 1 ? 'Persona registrada' : 'Personas registradas'}
              nota="en este dispositivo"
            >
              <span aria-label={`${cantidad} personas en el padrón`}>{cantidad}</span>
            </CifraDestacada>
          )}

          {codigoRecienCreado !== null ? (
            <div
              role="status"
              className="oc-tarjeta flex flex-col gap-1 border-primario bg-primario-suave"
              data-estado="pendiente-de-sincronizar"
            >
              <p className="text-lg font-bold">Alta guardada: {codigoRecienCreado}</p>
              <p className="text-sm text-texto-suave">
                Guardado en esta tablet. Todavía no se envía a ninguna parte. Anota el código en
                el papel del comedor.
              </p>
            </div>
          ) : null}

          {error !== null ? (
            <div id="error-padron">
              <EstadoPantalla estado="error">{error}</EstadoPantalla>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={enviar}
          className="oc-tarjeta flex flex-col gap-4"
          aria-label="Alta de persona"
        >
          <p className="text-lg font-bold">Alta de persona</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={ETIQUETA}>Año de nacimiento</span>
              <input
                name="anioNacimiento"
                inputMode="numeric"
                autoComplete="off"
                value={formulario.anioNacimiento}
                onChange={(e) => cambiar('anioNacimiento', e.target.value)}
                className="oc-campo"
                aria-describedby={error === null ? undefined : 'error-padron'}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={ETIQUETA}>Sexo</span>
              <select
                name="sexo"
                value={formulario.sexo}
                onChange={(e) => cambiar('sexo', e.target.value as Formulario['sexo'])}
                className="oc-campo"
              >
                <option value="F">Mujer</option>
                <option value="M">Hombre</option>
                <option value="X">Otro</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className={ETIQUETA}>Grupo</span>
              <select
                name="categoria"
                value={formulario.categoria}
                onChange={(e) =>
                  cambiar('categoria', e.target.value as Formulario['categoria'])
                }
                className="oc-campo"
              >
                <option value="adulto">Adulto</option>
                <option value="adulto_mayor">Adulto mayor</option>
                <option value="nino">Niño o niña</option>
                <option value="gestante">Gestante</option>
                <option value="lactante">Lactante</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className={ETIQUETA}>Apodo</span>
              <span className="text-xs text-texto-suave">Opcional, queda en esta tablet</span>
              <input
                name="alias"
                autoComplete="off"
                value={formulario.alias}
                onChange={(e) => cambiar('alias', e.target.value)}
                className="oc-campo"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className={ETIQUETA}>Nombre para reconocerla</span>
              <span className="text-xs text-texto-suave">Opcional, queda en esta tablet</span>
              <input
                name="nombreLocal"
                autoComplete="off"
                value={formulario.nombreLocal}
                onChange={(e) => cambiar('nombreLocal', e.target.value)}
                className="oc-campo"
              />
            </label>
          </div>

          {/* La accion de la pantalla, al final del formulario y a todo el ancho. */}
          <div className="[&>button]:w-full">
            <BotonGrande disabled={guardando} type="submit">
              {guardando ? 'Guardando…' : 'Guardar alta'}
            </BotonGrande>
          </div>
        </form>
      </div>
    </section>
  );
}
