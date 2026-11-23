import { useEffect, useState } from 'react';

import { BotonGrande } from '@hackods/ui';

import { OLLA_DEMO, guardarRacion, listarPersonas, racionDe } from '../../data/repositorio.js';

/**
 * Servicio del dia: una racion por persona, explicada con al menos dos razones.
 *
 * `racionSchema.razones` exige >= 2 y `@hackods/contracts` es quien valida: la
 * pantalla no inventa una tercera para "pasar". Los pesos y nutrientes no se
 * calculan aca (son de `packages/nutrition`, DEC-2026-0003): si no hay calculo,
 * se dice `sin dato` en vez de dibujar un cero.
 *
 * Estados: cargando / vacio (sin padron) / error / pendiente de sincronizar.
 */
const RAZONES_MINIMAS = 2;

interface Fila {
  readonly codigoP: string;
  readonly guardada: boolean;
}

export function ServicioPage() {
  const [filas, setFilas] = useState<readonly Fila[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [razones, setRazones] = useState<readonly string[]>(['', '']);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ultimaGuardada, setUltimaGuardada] = useState<string | null>(null);

  const recargar = async (): Promise<void> => {
    const personas = await listarPersonas(OLLA_DEMO);
    const raciones = await Promise.all(personas.map((p) => racionDe(p.codigoP, OLLA_DEMO)));
    setFilas(
      personas.map((p, i) => ({ codigoP: p.codigoP, guardada: raciones[i] !== undefined })),
    );
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
  const razonesSuficientes = razonesValidas.length >= RAZONES_MINIMAS;

  const guardar = (codigoP: string): void => {
    setError(null);
    if (!razonesSuficientes) {
      setError(`Hacen falta al menos ${RAZONES_MINIMAS} razones: una sola no justifica la ración.`);
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
        await recargar();
      })
      .catch(() => {
        setError('No se pudo guardar la ración en el dispositivo. Intentá otra vez.');
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  const totalGuardadas = filas?.filter((f) => f.guardada).length ?? 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold">Servicio del día</h2>
        <p className="text-gray-600">
          Raciones de hoy. Cada ración se explica con al menos dos razones.
        </p>
      </div>

      {cargando ? (
        <p role="status" className="text-gray-600">
          Leyendo el servicio guardado en este dispositivo…
        </p>
      ) : null}

      {filas !== null && filas.length === 0 ? (
        <p className="rounded-lg border border-gray-300 bg-gray-50 p-4">
          No hay personas en el padrón. Primero se da de alta a alguien en Padrón.
        </p>
      ) : null}

      {filas !== null && filas.length > 0 ? (
        <p className="text-gray-600">
          {totalGuardadas} de {filas.length} raciones registradas en este dispositivo.
        </p>
      ) : null}

      {ultimaGuardada !== null ? (
        <div
          role="status"
          className="rounded-lg border border-gray-300 bg-gray-50 p-4"
          data-estado="pendiente-de-sincronizar"
        >
          <p className="text-lg font-semibold">Ración de {ultimaGuardada} guardada</p>
          <p className="text-gray-600">Pendiente de sincronizar. La red no hizo falta.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2" aria-label="Datos de la ración">
        <p className="text-gray-600">
          Grupo por edad: <strong>sin dato</strong> — el cálculo por grupo es de nutrición y todavía
          no está conectado.
        </p>
        <p className="text-gray-600">
          Peso y nutrientes: <strong>sin dato</strong> — no se inventan cifras.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Razones de la ración (mínimo 2)</legend>
        {razones.map((valor, indice) => (
          <label key={indice} className="flex flex-col gap-1">
            <span>Razón {indice + 1}</span>
            <input
              name={`razon-${indice + 1}`}
              value={valor}
              onChange={(e) =>
                setRazones((rs) => rs.map((r, i) => (i === indice ? e.target.value : r)))
              }
              className="rounded border border-gray-400 p-2"
            />
          </label>
        ))}
        <div>
          <BotonGrande variante="secundario" onClick={() => setRazones((rs) => [...rs, ''])}>
            Agregar otra razón
          </BotonGrande>
        </div>
      </fieldset>

      {error !== null ? (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      ) : null}

      {filas !== null && filas.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Personas del padrón">
          {filas.map((fila) => (
            <li
              key={fila.codigoP}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-300 p-3"
            >
              <span className="text-lg font-semibold">{fila.codigoP}</span>
              {fila.guardada ? (
                <span className="font-semibold">Ración registrada · pendiente de sincronizar</span>
              ) : (
                <BotonGrande disabled={guardando} onClick={() => guardar(fila.codigoP)}>
                  Servir ración
                </BotonGrande>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
