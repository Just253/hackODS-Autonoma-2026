import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { BotonGrande, EstadoSync } from '@hackods/ui';

import { baseDeOlla } from '../data/base.js';
import { outboxDe } from '../data/outbox-repo.js';
import { OLLA_DEMO } from '../data/repositorio.js';
import { SyncLocal } from '../data/sync-local.js';

/**
 * Shell de la PWA: navegacion entre las rutas del esqueleto y el badge de
 * sincronizacion.
 * Archivo caliente (MODO-6H seccion 2.1): lo edita el dueno de `area:web`.
 *
 * El badge cuenta el outbox real en Dexie. No hay Supabase en la demo
 * (MODO-6H seccion 5): `SyncLocal` marca los eventos como enviados sin red, y
 * el texto lo dice siempre ("(local)"). Un "Sincronizado" a secas fingiria una
 * red que no existe.
 */
const ENLACES = [
  { a: '/padron', texto: 'Padrón' },
  { a: '/servicio', texto: 'Servicio' },
  { a: '/comprobante', texto: 'Comprobante' },
  { a: '/presupuesto', texto: 'Presupuesto' },
  { a: '/precios', texto: 'Precios' },
  { a: '/solicitud', texto: 'Entre ollas' },
  { a: '/reporte', texto: 'Reporte' },
] as const;

/** Textos exactos del badge (issue #19); se exportan para no duplicarlos en tests. */
export function textoPendientes(cantidad: number): string {
  return `${cantidad} cambios pendientes de sincronizar (local)`;
}

export const TEXTO_SINCRONIZADO_LOCAL = 'Sincronizado (local)';

/**
 * Cuenta los pendientes del outbox y expone un push local.
 *
 * El push existe para que el paso 2:50 del guion ("4 cambios pendientes ->
 * sincronizados") sea una accion real sobre Dexie y no una animacion.
 */
function useSyncLocal(): {
  readonly pendientes: number;
  readonly empujar: () => Promise<void>;
} {
  const [pendientes, setPendientes] = useState(0);

  const leer = useCallback(async (): Promise<number> => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    return outbox.total();
  }, []);

  useEffect(() => {
    let vigente = true;
    // Si la base se cierra (desmontaje abrupto, recarga) no hay badge que
    // actualizar: se ignora. El proximo montaje vuelve a leer.
    leer()
      .then((total) => {
        if (vigente) {
          setPendientes(total);
        }
      })
      .catch(() => {
        /* sin base no hay conteo; se muestra el estado inicial */
      });
    return () => {
      vigente = false;
    };
  }, [leer]);

  const empujar = useCallback(async (): Promise<void> => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    await new SyncLocal(outbox).push();
    setPendientes(outbox.total());
  }, []);

  return { pendientes, empujar };
}

export function Shell() {
  const { pendientes, empujar } = useSyncLocal();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Ollas comunes</h1>
        <p className="text-gray-600">Funciona sin internet. Nada se envía a la red.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <EstadoSync
          texto={pendientes > 0 ? textoPendientes(pendientes) : TEXTO_SINCRONIZADO_LOCAL}
          tono={pendientes > 0 ? 'pendiente' : 'local'}
        />
        {pendientes > 0 ? (
          <BotonGrande variante="secundario" onClick={() => void empujar()}>
            Sincronizar ahora (local)
          </BotonGrande>
        ) : null}
      </div>

      <nav aria-label="Secciones" className="flex flex-wrap gap-2">
        {ENLACES.map(({ a, texto }) => (
          <NavLink
            key={a}
            to={a}
            className={({ isActive }) =>
              `rounded border border-gray-400 px-3 py-2 ${isActive ? 'bg-gray-200 font-semibold' : ''}`
            }
          >
            {texto}
          </NavLink>
        ))}
      </nav>

      <main>
        <Outlet />
      </main>

      <footer className="text-sm text-gray-600">
        Datos simulados. Esto apoya la decisión de la olla; no es un diagnóstico.
      </footer>
    </div>
  );
}