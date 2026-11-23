import { useEffect, useState } from 'react';
import { BotonGrande, CifraDestacada, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

import { AvisoSinSesion } from '../../app/AvisoSinSesion.js';
import { useSesion } from '../../app/sesion.js';
import { useClienteRemoto } from '../../data/ProveedorRemoto.js';
import { listarPersonas, type PersonaRemota } from '../../data/remoto.js';

/**
 * Padron: la lista real de personas de la olla.
 *
 * Lo que se muestra es `P-XXXX` y su grupo (DEC-2026-0002). No hay nombres,
 * documentos, telefonos ni columnas de salud: la consulta pide solo
 * `codigo_p, categoria, olla_id`.
 *
 * De donde salen los datos:
 *
 * - sesion cloud -> `listarPersonas(ollaId)` contra Supabase. La olla sale de
 *   `olla_members`, nunca de un input (`apps/web/AGENTS.md` §3).
 * - sin sesion o sin env -> "Conectá Supabase para ver el padrón". NO hay
 *   fixtures: que todas las ollas mostraran las mismas personas fue el bug que
 *   este cambio arregla.
 * - error de red/RLS -> estado de error con reintento, sin caer a datos de ejemplo.
 *
 * El conteo sale de la MISMA lista que se pinta (no de una consulta aparte que
 * pueda decir otro numero).
 */

/** Etiqueta legible del grupo. Si llega un grupo desconocido, `sin dato`. */
const ETIQUETA_CATEGORIA: Readonly<Record<string, string>> = {
  adulto: 'Adulto',
  adulto_mayor: 'Adulto mayor',
  nino: 'Niño o niña',
  gestante: 'Gestante',
  lactante: 'Lactante',
};

function etiquetaCategoria(categoria: string): string {
  return ETIQUETA_CATEGORIA[categoria] ?? 'sin dato';
}

type EstadoDatos = 'cargando' | 'listo' | 'error';

export function PadronPage() {
  const { sesion } = useSesion();
  const cliente = useClienteRemoto();
  const [estado, setEstado] = useState<EstadoDatos>('cargando');
  const [personas, setPersonas] = useState<readonly PersonaRemota[]>([]);
  const [intento, setIntento] = useState(0);

  const enNube = sesion.modo === 'cloud';

  useEffect(() => {
    if (!enNube) return;
    let vigente = true;
    setEstado('cargando');
    void listarPersonas(sesion.ollaId, cliente).then((resultado) => {
      if (!vigente) return;
      if (!resultado.ok) {
        setPersonas([]);
        setEstado('error');
        return;
      }
      setPersonas(resultado.datos);
      setEstado('listo');
    });
    return () => {
      vigente = false;
    };
  }, [enNube, sesion.ollaId, cliente, intento]);

  const reintentar = (): void => setIntento((n) => n + 1);

  if (!enNube) {
    return (
      <section className="flex flex-col gap-4 lg:gap-6">
        <EncabezadoPantalla titulo="Padrón" />
        <AvisoSinSesion que="el padrón" />
      </section>
    );
  }

  const cantidad = personas.length;

  return (
    <section className="flex flex-col gap-4 lg:gap-6">
      <EncabezadoPantalla
        titulo="Padrón"
        descripcion="Cada persona se identifica con un código P-XXXX. No se piden nombres, documentos ni teléfonos."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          {/* La cifra primero: "cuantas personas hay" es la pregunta de entrada. */}
          {estado === 'cargando' ? (
            <EstadoPantalla estado="cargando">Leyendo el padrón de la olla…</EstadoPantalla>
          ) : estado === 'error' ? (
            <EstadoPantalla
              estado="error"
              accion={
                <BotonGrande variante="secundario" onClick={reintentar}>
                  Reintentar
                </BotonGrande>
              }
            >
              No se pudieron leer las personas de la olla.
            </EstadoPantalla>
          ) : cantidad === 0 ? (
            <div className="oc-tarjeta flex flex-col gap-1" data-estado="vacio">
              <span className="oc-estado__etiqueta text-texto-suave">Padrón vacío</span>
              <p>Todavía no hay personas cargadas en esta olla. No se muestra ninguna de ejemplo.</p>
            </div>
          ) : (
            <CifraDestacada
              etiqueta={cantidad === 1 ? 'Persona registrada' : 'Personas registradas'}
              nota="en esta olla"
            >
              <span
                aria-label={
                  cantidad === 1 ? '1 persona en el padrón' : `${cantidad} personas en el padrón`
                }
              >
                {cantidad}
              </span>
            </CifraDestacada>
          )}
        </div>

        <div className="overflow-hidden rounded-oc border border-borde bg-superficie">
          <h3 className="border-b border-borde px-4 py-3 text-sm font-bold uppercase tracking-wide text-texto-suave">
            Personas
          </h3>
          {estado === 'listo' && cantidad > 0 ? (
            <ul aria-label="Personas del padrón" className="divide-y divide-borde">
              {personas.map((persona) => (
                <li
                  key={persona.codigoP}
                  data-codigo-p={persona.codigoP}
                  className="flex min-h-14 items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="font-semibold tabular-nums">{persona.codigoP}</span>
                  <span className="text-sm text-texto-suave">
                    {etiquetaCategoria(persona.categoria)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-texto-suave">
              {estado === 'listo'
                ? 'Sin personas para listar.'
                : 'La lista aparece cuando termina la lectura.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
