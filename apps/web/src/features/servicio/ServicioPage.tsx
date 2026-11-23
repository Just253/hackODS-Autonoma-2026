import { useEffect, useState } from 'react';

import type { Persona } from '@hackods/contracts';
import { racionSchema } from '@hackods/contracts';
import {
  BotonGrande,
  CifraDestacada,
  EncabezadoPantalla,
  EstadoPantalla,
} from '@hackods/ui';

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
 * Orden: las razones van ANTES de la lista de personas porque son el requisito
 * de la accion. Antes estaban despues: se tocaba "Servir ración", la app
 * respondia "faltan razones" y habia que bajar a buscarlas. En escritorio la
 * tarjeta de razones queda fija a la derecha mientras se recorre el padron.
 */
/**
 * El mínimo de razones no se copia acá: lo manda `racionSchema.razones` y se
 * pregunta al propio schema. La pantalla solo usa la respuesta para avisar
 * antes de intentar guardar; el rechazo real es del contrato.
 */
const RAZONES_DEL_CONTRATO = racionSchema.shape.razones;

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
            : 'No se pudo guardar la ración en el dispositivo. Intenta otra vez.',
        );
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  const totalGuardadas = filas?.filter((f) => f.guardada).length ?? 0;

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Servicio del día"
        descripcion="Raciones de hoy. Cada ración se explica con al menos dos razones."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start lg:gap-6">
        {/* A · la cifra del dia */}
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
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

          {filas !== null && filas.length > 0 ? (
            <CifraDestacada
              etiqueta="Raciones registradas"
              nota={`de ${filas.length} personas en este dispositivo`}
            >
              <span data-testid="total-raciones-cifra">{totalGuardadas}</span>
            </CifraDestacada>
          ) : null}

          {ultimaGuardada !== null ? (
            <div
              role="status"
              className="oc-tarjeta flex flex-col gap-1 border-primario bg-primario-suave"
              data-estado="pendiente-de-sincronizar"
            >
              <p className="text-lg font-bold">Ración de {ultimaGuardada} guardada</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-texto-suave">
                Guardado en esta tablet. Todavía no se envía a ninguna parte. La red no hizo falta.
              </p>
            </div>
          ) : null}

          {error !== null ? <EstadoPantalla estado="error">{error}</EstadoPantalla> : null}
        </div>

        {/* B · el requisito: las razones, junto a la accion */}
        {filas !== null && filas.length > 0 ? (
          <div className="oc-tarjeta flex flex-col gap-2 lg:sticky lg:top-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <h3 className="text-sm font-bold">Razones de la ración (más de una)</h3>
            <p className="text-xs text-texto-suave">
              Se guardan con la ración que sirvas; después se limpian para la siguiente persona.
            </p>
            {razones.map((valor, indice) => (
              <label key={indice} className="flex flex-col gap-1">
                <span className="text-sm">Razón {indice + 1}</span>
                <input
                  name={`razon-${indice + 1}`}
                  value={valor}
                  onChange={(e) =>
                    setRazones((rs) => rs.map((r, i) => (i === indice ? e.target.value : r)))
                  }
                  className="oc-campo"
                />
              </label>
            ))}
            <div className="[&>button]:w-full">
              <BotonGrande variante="secundario" onClick={() => setRazones((rs) => [...rs, ''])}>
                Agregar otra razón
              </BotonGrande>
            </div>
            <p className="text-xs text-texto-suave">
              Peso y nutrientes: <strong>sin dato</strong> — no se inventan cifras.
            </p>
          </div>
        ) : null}

        {/* C · a quien se sirve */}
        <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2">
          {filas !== null && filas.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Personas del padrón">
              {filas.map((fila) => (
                <li
                  key={fila.codigoP}
                  className="oc-tarjeta flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <span className="font-mono text-lg font-bold">{fila.codigoP}</span>
                  {fila.guardada ? (
                    <span className="oc-pendiente">Ración registrada · guardada en esta tablet</span>
                  ) : (
                    <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">
                      <BotonGrande disabled={guardando} onClick={() => guardar(fila.codigoP)}>
                        Servir ración
                      </BotonGrande>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null}

          {personas !== null && personas.length > 0 ? (
            <section className="flex flex-col gap-2" aria-label="Menú firmado del día">
              <h3 className="text-sm font-bold uppercase tracking-wide text-texto-suave">
                Menú firmado del día
              </h3>
              <ServicioResumen menus={menusDelDiaDemo()} personas={personas} />
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
