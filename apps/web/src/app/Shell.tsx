import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { Icono } from '@hackods/ui';

import { baseDeOlla } from '../data/base.js';
import { outboxDe } from '../data/outbox-repo.js';
import { contarPersonas, OLLA_DEMO } from '../data/repositorio.js';
import { SyncLocal } from '../data/sync-local.js';
import { SECCIONES, destinoDeRuta, destinosDeBarra, destinosDeMas } from './navegacion.js';
import { ETIQUETA_ROL, OLLAS_DEMO, ROLES, textoDivisor, useSesion } from './sesion.js';
import type { ControlSesion } from './sesion.js';
import { fijarPersonasGuardadas, useEstadoSync, alAvisarCambio } from './sync.js';
import { type TamanoTexto, useTexto } from './texto.js';

/**
 * Cascaron de la PWA. Una sola pantalla, dos distribuciones:
 *
 *   telefono (< 64rem)                 escritorio (>= 64rem)
 *   ┌──────────────────────┐           ┌──────────┬────────────────────────┐
 *   │ Olla San Juan  ● loc │           │ Olla     │ Olla / seccion   ● loc │
 *   ├──────────────────────┤           │  San Juan├────────────────────────┤
 *   │ contenido (scroll)   │           │ Dia a dia│ contenido (scroll)     │
 *   │                      │           │  Padron  │  max ~68rem, grillas   │
 *   ├──────────────────────┤           │  Servir  │  de 2 columnas         │
 *   │ [Padron][Servir]...  │           │ ...      │                        │
 *   └──────────────────────┘           │ letra    │                        │
 *                                      └──────────┴────────────────────────┘
 *
 * Por que: en la tablet se usa de pie, con una mano en la olla; el pulgar
 * alcanza la mitad inferior y los destinos diarios van abajo. En un monitor,
 * una barra inferior es un telefono estirado: el rail deja el contenido a la
 * vista y la navegacion siempre en el mismo lugar.
 *
 * Las dos navegaciones existen en el DOM y el CSS muestra una; solo cambia el
 * `aria-label` para no declarar dos veces el mismo landmark en el lector de
 * pantalla. El conteo del padron alimenta la pastilla del header: el header no
 * abre Dexie por su lado.
 *
 * La pastilla dice UNA cosa a la vez, y la mas urgente gana:
 *
 * - hay eventos sin enviar → "N cambios pendientes de sincronizar (local)" y
 *   el boton de sincronizar (en el header de escritorio; en el telefono, en la
 *   hoja "Más");
 * - no hay nada pendiente → "En este dispositivo" (lo que se guardo esta aca),
 *   nunca "Sincronizado" a secas: la demo no tiene servidor.
 *
 * El outbox es otra cosa que el conteo del padron: `app/sync.ts` avisa cuando
 * una pantalla escribe personas; `OutboxDexie` avisa cuando cambia el conjunto
 * de eventos sin enviar. Ninguno de los dos se sondea con `setInterval`.
 */

/** Textos exactos del badge (issue #19); se exportan para no duplicarlos en tests. */
export function textoPendientes(cantidad: number): string {
  const sustantivo = cantidad === 1 ? 'cambio pendiente' : 'cambios pendientes';
  return `${cantidad} ${sustantivo} de sincronizar (local)`;
}

/**
 * Cuenta los pendientes del outbox y los empuja con `SyncLocal`.
 *
 * El conteo NO se lee una sola vez: `OutboxDexie` mantiene un espejo en
 * memoria y avisa a sus oyentes en `encolar`, `marcarEnviado`, `marcarError` y
 * cuando una transaccion confirma su evento. Asi, dos altas seguidas suben el
 * badge de 1 a 2 sin recargar, y el push lo baja a cero en el acto.
 */
function useOutbox(): {
  readonly pendientes: number;
  readonly empujar: () => Promise<void>;
} {
  const [pendientes, setPendientes] = useState(0);
  // Una instancia por montaje: si la base se cerro (tests, recarga) la
  // proxima lectura toma la conexion nueva y su outbox.
  const [outbox] = useState(() => outboxDe(baseDeOlla(OLLA_DEMO)));

  useEffect(() => {
    let vigente = true;
    const leer = (): void => {
      if (vigente) setPendientes(outbox.total());
    };
    const quitar = outbox.suscribir(leer);
    // Lo persistido de una sesion anterior. Si la base no abre, el badge se
    // queda en cero: no se inventa un numero.
    outbox
      .cargar()
      .then(leer)
      .catch(() => {
        /* sin base no hay conteo; se muestra el estado inicial */
      });
    return () => {
      vigente = false;
      quitar();
    };
  }, [outbox]);

  const empujar = async (): Promise<void> => {
    // `marcarEnviado` avisa a los oyentes: no hace falta refrescar a mano.
    await new SyncLocal(outbox).push();
  };

  return { pendientes, empujar };
}

export function Shell() {
  const [abiertoMas, setAbiertoMas] = useState(false);
  const [tamano, cambiarTamano] = useTexto();
  const controlSesion = useSesion();
  const { sesion } = controlSesion;
  const sync = useEstadoSync();
  const { pendientes, empujar } = useOutbox();
  const ubicacion = useLocation();

  const barra = destinosDeBarra();
  const mas = destinosDeMas();
  const actual = destinoDeRuta(ubicacion.pathname);

  /**
   * La pastilla del header: una sola, y la verdad mas urgente primero. Con
   * cambios sin enviar manda el outbox; si ademas no hay red, se dice en el
   * detalle en vez de esconderlo.
   */
  const pildora =
    pendientes > 0
      ? {
          tono: 'pendiente' as const,
          texto: textoPendientes(pendientes),
          detalle: sync.tono === 'sin-conexion' ? 'Sin conexión' : null,
        }
      : sync;

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

  // Escape cierra la hoja. Sin esto, en un telefono con teclado externo la
  // unica salida es tocar "Cerrar".
  useEffect(() => {
    if (!abiertoMas) return;
    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') setAbiertoMas(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [abiertoMas]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-fondo text-texto lg:flex-row">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-oc focus:bg-primario focus:px-4 focus:py-3 focus:text-primario-texto"
      >
        Ir al contenido
      </a>

      {/* Rail de escritorio: marca, secciones agrupadas y tamano de letra. */}
      <aside className="hidden w-[var(--ancho-rail)] shrink-0 flex-col border-r border-borde bg-superficie lg:flex">
        <div className="flex flex-col gap-0.5 border-b border-borde px-4 py-4">
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-texto-suave">
            Olla común
          </span>
          <span className="text-lg font-bold leading-tight">{sesion.nombreOlla}</span>
          <span className="text-[0.6875rem] font-semibold text-texto-suave">
            {ETIQUETA_ROL[sesion.rol]}
          </span>
        </div>

        <nav aria-label="Secciones principales" className="flex-1 overflow-y-auto px-2 py-4">
          {SECCIONES.map((seccion) => (
            <div key={seccion.titulo} className="mb-5 last:mb-0">
              <p className="px-2 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-texto-suave">
                {seccion.titulo}
              </p>
              <ul className="flex flex-col gap-0.5">
                {seccion.destinos.map((destino) => (
                  <li key={destino.a}>
                    <NavLink
                      to={destino.a}
                      title={destino.tarea}
                      className={({ isActive }) =>
                        [
                          'flex min-h-11 items-center gap-2.5 rounded-oc px-2.5 py-2 text-[0.9375rem] font-semibold transition-colors',
                          isActive
                            ? 'bg-primario-suave text-primario'
                            : 'text-texto-suave hover:bg-tenue hover:text-texto',
                        ].join(' ')
                      }
                    >
                      <Icono nombre={destino.icono} />
                      <span className="truncate">{destino.descripcion}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-borde px-3 py-3">
          <ControlTexto tamano={tamano} cambiar={cambiarTamano} />
          <div className="mt-3 border-t border-borde pt-3">
            <SelectorSesion control={controlSesion} />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="z-20 flex min-h-[var(--alto-header)] shrink-0 items-center justify-between gap-3 border-b border-borde bg-superficie px-4 pt-[env(safe-area-inset-top)] lg:px-8 lg:pt-0">
          <div className="flex min-w-0 flex-col lg:flex-row lg:items-baseline lg:gap-2">
            {/*
              Divisor de contexto (FE-01, DEC-20261123-1358-8feaf9): "Olla <nombre> · <Rol>".
              Sale de la sesion, no de una constante. Se lee como TEXTO, no solo
              por color: en una tablet al sol el color no se distingue y el lector
              de pantalla necesita la palabra.
            */}
            <p
              className="text-xs font-semibold tracking-wide text-texto-suave lg:text-sm"
              data-divisor-contexto=""
            >
              {textoDivisor(sesion)}
            </p>
            <span aria-hidden="true" className="hidden text-texto-suave lg:inline">
              /
            </span>
            <p className="truncate text-base font-bold lg:text-sm lg:font-normal lg:text-texto-suave">
              {actual?.descripcion ?? 'Ollas comunes'}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2" data-pendientes={pendientes}>
            {/*
              En escritorio el boton vive al lado de la pastilla. En el telefono
              no entra en el header: la accion esta en la hoja "Más" y el
              conteo se sigue viendo arriba.
            */}
            {pendientes > 0 ? (
              <button
                type="button"
                onClick={() => void empujar()}
                className="oc-boton oc-boton--primario hidden lg:inline-flex"
              >
                Sincronizar ahora (local)
              </button>
            ) : null}

            <SyncPildora tono={pildora.tono} texto={pildora.texto} detalle={pildora.detalle} />
          </div>
        </header>

        <main id="contenido" className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[var(--ancho-contenido)] px-4 pt-4 pb-[calc(var(--alto-nav)+env(safe-area-inset-bottom)+1.5rem)] lg:px-8 lg:py-8">
            <Outlet />
            <p className="mt-10 border-t border-borde pt-4 text-xs text-texto-suave">
              Datos simulados. Esto apoya la decisión de la olla; no es un diagnóstico.
            </p>
          </div>
        </main>
      </div>

      {/*
        Hoja "Más" del telefono: abre DENTRO del flujo, entre el contenido y la
        barra. No es un overlay: asi no hay que adivinar la altura de la barra
        (que crece con el tamano de letra) ni pelear con el area segura.
      */}
      {abiertoMas && mas.length > 0 ? (
        <nav
          id="mas-secciones"
          aria-label="Más secciones"
          className="z-40 shrink-0 border-t border-borde bg-superficie px-4 pt-3 shadow-[var(--sombra-alta)] lg:hidden"
        >
          <p className="mx-auto max-w-[var(--ancho-lectura)] px-1 pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-texto-suave">
            Otros
          </p>
          <ul className="mx-auto flex max-w-[var(--ancho-lectura)] flex-col gap-2 pb-3">
            {mas.map((destino) => (
              <li key={destino.a}>
                <NavLink
                  to={destino.a}
                  className="flex min-h-14 items-center gap-2.5 rounded-oc border border-borde bg-fondo px-3 py-2 text-[0.9375rem] font-semibold active:bg-primario-suave"
                >
                  <Icono nombre={destino.icono} />
                  <span className="flex min-w-0 flex-col">
                    <span>{destino.descripcion}</span>
                    <span className="text-xs font-normal text-texto-suave">{destino.tarea}</span>
                  </span>
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Accion de sync del telefono: el header muestra el conteo, la accion vive aca. */}
          {pendientes > 0 ? (
            <div className="mx-auto w-full max-w-[var(--ancho-lectura)] border-t border-borde py-3">
              <button
                type="button"
                onClick={() => void empujar()}
                className="oc-boton oc-boton--primario w-full"
              >
                Sincronizar ahora (local)
              </button>
            </div>
          ) : null}

          <div className="mx-auto flex max-w-[var(--ancho-lectura)] items-end justify-between gap-3 border-t border-borde py-3">
            <ControlTexto tamano={tamano} cambiar={cambiarTamano} />
            <button
              type="button"
              onClick={() => setAbiertoMas(false)}
              className="oc-boton oc-boton--secundario"
            >
              Cerrar
            </button>
          </div>

          <div className="mx-auto w-full max-w-[var(--ancho-lectura)] border-t border-borde py-3 lg:hidden">
            <SelectorSesion control={controlSesion} />
          </div>
        </nav>
      ) : null}

      {/* Barra inferior del telefono: cuatro diarios + "Más". */}
      <nav
        aria-label="Secciones"
        className="z-40 shrink-0 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto flex max-w-[var(--ancho-lectura)] items-stretch">
          {barra.map((destino) => (
            <li key={destino.a} className="min-w-0 flex-1">
              <NavLink
                to={destino.a}
                className={({ isActive }) =>
                  [
                    'flex min-h-[calc(var(--alto-nav)-1px)] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] font-semibold leading-tight',
                    isActive ? 'text-primario' : 'text-texto-suave',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={[
                        'flex h-8 w-8 items-center justify-center rounded-full',
                        isActive ? 'bg-primario-suave text-primario' : '',
                      ].join(' ')}
                    >
                      <Icono nombre={destino.icono} />
                    </span>
                    <span className="max-w-full truncate">{destino.texto}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}

          {mas.length > 0 ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setAbiertoMas((v) => !v)}
                aria-expanded={abiertoMas}
                aria-controls={mas.length > 0 ? 'mas-secciones' : undefined}
                className={[
                  'flex min-h-[calc(var(--alto-nav)-1px)] w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.6875rem] font-semibold leading-tight',
                  abiertoMas ? 'text-primario' : 'text-texto-suave',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full',
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

/**
 * Pastilla de sync: tono + punto + texto. Nunca solo color.
 *
 * Es la unica pastilla del header: `pendiente` mientras el outbox tenga
 * eventos, `local` cuando lo guardado ya esta en este dispositivo y
 * `sin-conexion` cuando el navegador dice que no hay red.
 */
function SyncPildora({
  tono,
  texto,
  detalle,
}: {
  readonly tono: 'local' | 'sin-conexion' | 'pendiente';
  readonly texto: string;
  readonly detalle: string | null;
}) {
  return (
    <div
      className={[
        'flex max-w-[12rem] shrink-0 flex-col items-end rounded-full border px-3 py-1 text-right',
        tono === 'local'
          ? 'border-borde bg-fondo text-texto-suave'
          : 'border-pendiente bg-pendiente-suave text-pendiente',
      ].join(' ')}
      role="status"
      aria-live="polite"
      data-estado-sync={tono}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold">
        <span
          aria-hidden="true"
          className={[
            'inline-block h-2 w-2 rounded-full',
            tono === 'local' ? 'bg-primario' : 'bg-pendiente',
          ].join(' ')}
        />
        {texto}
      </span>
      {detalle === null ? null : <span className="text-[0.6875rem]">{detalle}</span>}
    </div>
  );
}

const TAMANOS: readonly { valor: TamanoTexto; texto: string; nota: string }[] = [
  { valor: 'normal', texto: 'Normal', nota: 'Letra normal' },
  { valor: 'grande', texto: 'Grande', nota: 'Letra grande' },
  { valor: 'enorme', texto: 'Enorme', nota: 'Letra enorme' },
] as const;

/**
 * Selector de contexto (FE-01): olla y rol.
 *
 * Solo en modo demo. En `cloud` la sesion sale del JWT (TODO #62): el control
 * no se ofrece y se dice el motivo, porque un boton apagado sin explicacion
 * deja a la persona sin saber por que no puede cambiar de rol. La UI nunca es
 * la barrera de autorizacion (DEC-20261123-1358-8feaf9): el servidor vuelve a decidir
 * con `olla_members`.
 */
function SelectorSesion({ control }: { readonly control: ControlSesion }) {
  const { sesion, cambiarRol, cambiarOlla } = control;

  if (sesion.modo === 'cloud') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-texto-suave">Contexto</span>
        <p className="text-xs text-texto-suave">
          En modo nube, el rol y la olla salen de tu cuenta. No se cambian aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-xs font-semibold text-texto-suave">Olla</legend>
        <div className="flex gap-1">
          {OLLAS_DEMO.map((olla) => {
            const elegida = olla.ollaId === sesion.ollaId;
            return (
              <button
                key={olla.ollaId}
                type="button"
                aria-pressed={elegida}
                aria-label={`Olla ${olla.nombreOlla}`}
                onClick={() => cambiarOlla(olla.ollaId)}
                className={[
                  'min-h-11 min-w-0 flex-1 rounded-oc border px-2 text-xs font-semibold',
                  elegida
                    ? 'border-primario bg-primario text-primario-texto'
                    : 'border-borde-fuerte bg-superficie text-texto',
                ].join(' ')}
              >
                {olla.nombreOlla}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-xs font-semibold text-texto-suave">Rol (demo)</legend>
        <div className="grid grid-cols-2 gap-1">
          {ROLES.map((rol) => {
            const elegido = rol === sesion.rol;
            return (
              <button
                key={rol}
                type="button"
                aria-pressed={elegido}
                onClick={() => cambiarRol(rol)}
                className={[
                  'min-h-11 rounded-oc border px-2 text-xs font-semibold',
                  elegido
                    ? 'border-primario bg-primario text-primario-texto'
                    : 'border-borde-fuerte bg-superficie text-texto',
                ].join(' ')}
              >
                {ETIQUETA_ROL[rol]}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}


/**
 * Tamano de letra: la preferencia que de verdad se usa en la olla.
 *
 * Antes aca vivia un modo simple/avanzado que cambiaba cuantos destinos tenia
 * la barra y solo se encontraba dentro de "Más": escondia "Plata" y en
 * escritorio no hacia nada. El tamano de letra sirve en las dos
 * distribuciones, se nota al instante y usa los tokens `data-texto` que ya
 * existian en `tokens.css` (18 / 22 / 26 px de base).
 */
function ControlTexto({
  tamano,
  cambiar,
}: {
  readonly tamano: TamanoTexto;
  readonly cambiar: (siguiente: TamanoTexto) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="text-xs font-semibold text-texto-suave">Tamaño de letra</legend>
      <div className="flex gap-1">
        {TAMANOS.map((opcion) => {
          const elegido = opcion.valor === tamano;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={elegido}
              aria-label={opcion.nota}
              onClick={() => cambiar(opcion.valor)}
              className={[
                'min-h-11 min-w-0 flex-1 rounded-oc border px-2 text-xs font-semibold',
                elegido
                  ? 'border-primario bg-primario text-primario-texto'
                  : 'border-borde-fuerte bg-superficie text-texto',
              ].join(' ')}
            >
              {opcion.texto}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
