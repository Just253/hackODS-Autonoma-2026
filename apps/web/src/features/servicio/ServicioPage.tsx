import { useEffect, useState } from 'react';

import type { Persona } from '@hackods/contracts';
import { racionSchema } from '@hackods/contracts';
import { BotonGrande, EstadoPantalla } from '@hackods/ui';

import { avisarCambioLocal } from '../../app/sync.js';
import {
  OLLA_DEMO,
  RacionDuplicada,
  guardarRacion,
  listarPersonas,
  racionDe,
} from '../../data/repositorio.js';
import { menusDelDiaDemo } from '../../fixtures/servicio-demo.js';
import { ServicioResumen } from './ServicioResumen.js';

/**
 * Servicio del dia: una racion por persona, explicada con al menos dos razones.
 *
 * `racionSchema.razones` exige >= 2 y `@hackods/contracts` es quien valida: la
 * pantalla no inventa una tercera para "pasar". Los pesos y nutrientes no se
 * calculan aca (son de `packages/nutrition`, DEC-2026-0003): si no hay calculo,
 * se dice `sin dato` en vez de dibujar un cero.
 *
 * Estados: cargando / vacio (sin padron) / error / pendiente de sincronizar.
 *
 * Presentacion movil: primero "cuantas raciones van" (la cifra), despues la
 * lista de personas con el boton de servir grande, y debajo las razones: la
 * accion repetida -servir una por una- queda al alcance del pulgar.
 */
/**
 * El mínimo de razones no se copia acá: lo manda `racionSchema.razones` y se
 * pregunta al propio schema. La pantalla solo usa la respuesta para avisar
 * antes de intentar guardar; el rechazo real es del contrato.
 */
const RAZONES_DEL_CONTRATO = racionSchema.shape.razones;

const CAMPO =
  'min-h-[56px] w-full rounded-oc border border-borde-fuerte bg-superficie px-3 py-2 text-base';

interface Fila {
  readonly codigoP: string;
  readonly guardada: boolean;
}

export function ServicioPage() {
  const [filas, setFilas] = useState<readonly Fila[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [personas, setPersonas] = useState<readonly Persona[] | null>(null);
  const [razones, setRazones] = useState<readonly string[]>(['', '']);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ultimaGuardada, setUltimaGuardada] = useState<string | null>(null);

  const recargar = async (): Promise<void> => {
    const lista = await listarPersonas(OLLA_DEMO);
    const raciones = await Promise.all(lista.map((p) => racionDe(p.codigoP, OLLA_DEMO)));
    setPersonas(lista);
    setFilas(lista.map((p, i) => ({ codigoP: p.codigoP, guardada: raciones[i] !== undefined })));
  };

  useEffect(() => {
    let vigente = true;
    recargar()
      .catch(() => {
        if (vigente) setError('No se pudo leer el servicio guardado en el dispositivo.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
    // Se monta una vez: la lista se refresca despues de cada guardado.
  }, []);

  const razonesValidas = razones.filter((r) => r.trim() !== '');
  const faltanRazones = !RAZONES_DEL_CONTRATO.safeParse(razonesValidas).success;

  const guardar = (codigoP: string): void => {
    setError(null);
    if (faltanRazones) {
      setError('Faltan razones: la ración necesita más de una explicación.');
      return;
    }

    setGuardando(true);
    guardarRacion({
      personaCodigoP: codigoP,
      // Los componentes del menu firmado son de la integracion (H3:30) y de
      // `packages/nutrition`: hoy no hay menu cargado, asi que sin servicio.
      servicioId: null,
      razones: razonesValidas,
    })
      .then(async () => {
        setUltimaGuardada(codigoP);
        setRazones(['', '']);
        setError(null);
        await recargar();
        avisarCambioLocal();
      })
      .catch((error: unknown) => {
        // Duplicado: se dice tal cual. Un "intentá otra vez" ahi seria mentira.
        setError(
          error instanceof RacionDuplicada
            ? error.message
            : 'No se pudo guardar la ración en el dispositivo. Intentá otra vez.',
        );
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  const totalGuardadas = filas?.filter((f) => f.guardada).length ?? 0;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Servicio del día</h2>
        <p className="text-sm text-texto-suave">
          Raciones de hoy. Cada ración se explica con al menos dos razones.
        </p>
      </header>

      {personas !== null && personas.length > 0 ? (
        <ServicioResumen menus={menusDelDiaDemo()} personas={personas} />
      ) : null}

      {cargando ? (
        <EstadoPantalla estado="cargando">
          Leyendo el servicio guardado en este dispositivo…
        </EstadoPantalla>
      ) : null}

      {filas !== null && filas.length === 0 ? (
        <div className="oc-tarjeta flex flex-col gap-1" data-estado="vacio">
          <span className="oc-estado__etiqueta text-texto-suave">Sin padrón</span>
          <p>No hay personas en el padrón. Primero se da de alta a alguien en Padrón.</p>
        </div>
      ) : null}

      {/* La cifra del dia: cuantas van de cuantas. */}
      {filas !== null && filas.length > 0 ? (
        <div className="oc-tarjeta flex items-baseline justify-between gap-3">
          <p className="text-sm text-texto-suave">raciones registradas en este dispositivo</p>
          <p className="oc-cifra">{totalGuardadas}</p>
        </div>
      ) : null}

      {error !== null ? <EstadoPantalla estado="error">{error}</EstadoPantalla> : null}

      {ultimaGuardada !== null ? (
        <div
          role="status"
          className="oc-tarjeta border-primario bg-primario-suave"
          data-estado="pendiente-de-sincronizar"
        >
          <p className="text-lg font-bold">Ración de {ultimaGuardada} guardada</p>
          <p className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
            <span className="oc-pendiente">Pendiente de sincronizar</span>
            La red no hizo falta.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 text-sm text-texto-suave" aria-label="Datos de la ración">
        <p>
          Peso y nutrientes: <strong>sin dato</strong> — no se inventan cifras.
        </p>
      </div>

      {filas !== null && filas.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Personas del padrón">
          {filas.map((fila) => (
            <li
              key={fila.codigoP}
              className="oc-tarjeta flex flex-wrap items-center justify-between gap-2"
            >
              <span className="font-mono text-lg font-bold">{fila.codigoP}</span>
              {fila.guardada ? (
                <span className="oc-pendiente">Ración registrada · pendiente de sincronizar</span>
              ) : (
                <BotonGrande disabled={guardando} onClick={() => guardar(fila.codigoP)}>
                  Servir ración
                </BotonGrande>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset className="oc-tarjeta flex flex-col gap-2">
        <legend className="px-1 text-sm font-bold">Razones de la ración (más de una)</legend>
        {razones.map((valor, indice) => (
          <label key={indice} className="flex flex-col gap-1">
            <span className="text-sm">Razón {indice + 1}</span>
            <input
              name={`razon-${indice + 1}`}
              value={valor}
              onChange={(e) =>
                setRazones((rs) => rs.map((r, i) => (i === indice ? e.target.value : r)))
              }
              className={CAMPO}
            />
          </label>
        ))}
        <div>
          <BotonGrande variante="secundario" onClick={() => setRazones((rs) => [...rs, ''])}>
            Agregar otra razón
          </BotonGrande>
        </div>
      </fieldset>
    </section>
  );
}
