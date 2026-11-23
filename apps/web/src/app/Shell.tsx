import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { Icono } from '@hackods/ui';

import { contarPersonas } from '../data/repositorio.js';
import { destinoDeRuta, destinosDeBarra, destinosDeMas } from './navegacion.js';
import { type Modo, useModo } from './modo.js';
import { fijarPersonasGuardadas, useEstadoSync, alAvisarCambio } from './sync.js';

/**
 * Cascaron movil de la PWA.
 *
 * Tres zonas fijas y una que scrollea:
 *
 *   ┌──────────────────────────────────┐
 *   │ Olla San Juan   ● En este disp.  │  header 56 px, no se mueve
 *   ├──────────────────────────────────┤
 *   │ contenido (scroll)               │
 *   │                                  │
 *   ├──────────────────────────────────┤
 *   │ [Padrón] [Servir] [Boleta] [···] │  barra inferior ≥64 px + safe-area
 *   └──────────────────────────────────┘
 *
 * Por que: la tablet se usa de pie, con una mano en la olla. El pulgar alcanza
 * la mitad inferior de la pantalla; los destinos diarios van abajo y el menu
 * web de 7 enlaces en fila desaparece. Un solo objetivo por pantalla.
 *
 * El modo (`simple`/`avanzado`) decide cuantos destinos hay en la barra: tres
 * en simple, cuatro + "Más" en avanzado. Ver `navegacion.ts`.
 */
export function Shell() {
  const [modo, cambiarModo] = useModo();
  const [abiertoMas, setAbiertoMas] = useState(false);
  const sync = useEstadoSync();
  const ubicacion = useLocation();

  const barra = destinosDeBarra(modo);
  const mas = destinosDeMas(modo);
  const actual = destinoDeRuta(ubicacion.pathname);

  // Alimenta la pastilla del header sin que el header abra Dexie por su lado.
  // Sin red y sin base, se queda en cero: no se inventa un numero. Se repite
  // al cambiar de ruta y cuando una pantalla avisa que escribio (`alAvisarCambio`).
  useEffect(() => {
    let vigente = true;
    const contar = (): void => {
      contarPersonas()
        .then((n) => {
          if (vigente) fijarPersonasGuardadas(n);
        })
        .catch(() => {
          /* el header dice "En este dispositivo" aunque no pueda contar */
        });
    };
    contar();
    const quitar = alAvisarCambio(contar);
    return () => {
      vigente = false;
      quitar();
    };
  }, [ubicacion.pathname]);

  // Al cambiar de pantalla se cierra la hoja: no queda tapando la accion.
  useEffect(() => {
    setAbiertoMas(false);
  }, [ubicacion.pathname]);

  return (
    <div className="flex h-dvh flex-col bg-fondo text-texto">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-oc focus:bg-primario focus:px-4 focus:py-3 focus:text-primario-texto"
      >
        Ir al contenido
      </a>

      <header className="z-20 flex min-h-[var(--alto-header)] shrink-0 items-center justify-between gap-3 border-b border-borde bg-superficie px-4 pt-[env(safe-area-inset-top)]">
        <div className="flex min-w-0 flex-col">
          <p className="text-xs font-semibold tracking-wide text-texto-suave">Olla San Juan</p>
          <p className="truncate text-base font-bold">{actual?.descripcion ?? 'Ollas comunes'}</p>
        </div>

        <SyncPildora tono={sync.tono} texto={sync.texto} detalle={sync.detalle} />
      </header>

      <main
        id="contenido"
        className="mx-auto w-full max-w-[var(--ancho-columna)] flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'calc(var(--alto-nav) + 1.5rem)' }}
      >
        <Outlet />
        <p className="mt-8 text-sm text-texto-suave">
          Datos simulados. Esto apoya la decisión de la olla; no es un diagnóstico.
        </p>
      </main>

      {abiertoMas && mas.length > 0 ? (
        <nav
          id="mas-secciones"
          aria-label="Más secciones"
          className="fixed inset-x-0 z-30 border-t border-borde bg-superficie px-4 pt-3 shadow-[var(--sombra-alta)]"
          style={{ bottom: 'calc(var(--alto-nav) + env(safe-area-inset-bottom))' }}
        >
          <ul className="mx-auto grid max-w-[var(--ancho-columna)] grid-cols-2 gap-2 pb-3">
            {mas.map((destino) => (
              <li key={destino.a}>
                <NavLink
                  to={destino.a}
                  className="flex min-h-[56px] items-center gap-3 rounded-oc border border-borde bg-fondo px-3 py-2 text-base font-semibold active:bg-primario-suave"
                >
                  <Icono nombre={destino.icono} />
                  <span className="flex flex-col">
                    {destino.descripcion}
                    <span className="text-xs font-normal text-texto-suave">{destino.tarea}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mx-auto flex max-w-[var(--ancho-columna)] items-center justify-between gap-3 border-t border-borde py-3">
            <ModoRapido modo={modo} cambiarModo={cambiarModo} />
            <button
              type="button"
              onClick={() => setAbiertoMas(false)}
              className="oc-boton oc-boton--secundario"
            >
              Cerrar
            </button>
          </div>
        </nav>
      ) : null}

      <nav
        aria-label="Secciones"
        className="z-40 shrink-0 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto flex max-w-[var(--ancho-columna)] items-stretch">
          {barra.map((destino) => (
            <li key={destino.a} className="flex-1">
              <NavLink
                to={destino.a}
                className={({ isActive }) =>
                  [
                    'flex min-h-[calc(var(--alto-nav)-1px)] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold',
                    isActive ? ' text-primario' : 'text-texto-suave',
                  ].join('')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'flex h-9 w-9 items-center justify-center rounded-full',
                        isActive ? 'bg-primario-suave text-primario' : '',
                      ].join('')}
                    >
                      <Icono nombre={destino.icono} />
                    </span>
                    <span>{destino.texto}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}

          {mas.length > 0 ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setAbiertoMas((v) => !v)}
                aria-expanded={abiertoMas}
                aria-controls={mas.length > 0 ? 'mas-secciones' : undefined}
                className={[
                  'flex min-h-[calc(var(--alto-nav)-1px)] w-full flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-semibold',
                  abiertoMas ? 'text-primario' : 'text-texto-suave',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-full',
                    abiertoMas ? 'bg-primario-suave' : '',
                  ].join(' ')}
                >
                  <Icono nombre="mas" />
                </span>
                <span>Más</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}

/** Pastilla de sync: tono + punto + texto. Nunca solo color. */
function SyncPildora({
  tono,
  texto,
  detalle,
}: {
  readonly tono: 'local' | 'sin-conexion';
  readonly texto: string;
  readonly detalle: string | null;
}) {
  return (
    <div
      className={[
        'flex max-w-[9.5rem] shrink-0 flex-col items-end rounded-full border px-3 py-1 text-right',
        tono === 'sin-conexion'
          ? 'border-pendiente bg-pendiente-suave text-pendiente'
          : 'border-borde bg-fondo text-texto-suave',
      ].join(' ')}
      role="status"
      data-estado-sync={tono}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">
        <span
          aria-hidden="true"
          className={[
            'inline-block h-2 w-2 rounded-full',
            tono === 'sin-conexion' ? 'bg-pendiente' : 'bg-primario',
          ].join(' ')}
        />
        {texto}
      </span>
      {detalle === null ? null : <span className="text-[0.6875rem]">{detalle}</span>}
    </div>
  );
}

/** Cambio de modo en la hoja "Más": es la pantalla de ajustes de bolsillo. */
function ModoRapido({
  modo,
  cambiarModo,
}: {
  readonly modo: Modo;
  readonly cambiarModo: (siguiente: Modo) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-xs font-semibold text-texto-suave">Cómo se muestra la app</legend>
      <div className="flex gap-1">
        <ModoBoton modo="simple" actual={modo} cambiarModo={cambiarModo}>
          Simple
        </ModoBoton>
        <ModoBoton modo="avanzado" actual={modo} cambiarModo={cambiarModo}>
          Avanzado
        </ModoBoton>
      </div>
    </fieldset>
  );
}

function ModoBoton({
  modo,
  actual,
  cambiarModo,
  children,
}: {
  readonly modo: Modo;
  readonly actual: Modo;
  readonly cambiarModo: (siguiente: Modo) => void;
  readonly children: string;
}) {
  const elegido = modo === actual;
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={() => cambiarModo(modo)}
      className={[
        'min-h-[44px] rounded-oc border px-3 text-sm font-semibold',
        elegido
          ? 'border-primario bg-primario text-primario-texto'
          : 'border-borde-fuerte bg-superficie text-texto',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
