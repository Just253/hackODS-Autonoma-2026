import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearRouterDePrueba } from './router.js';
import { CLAVE_TEXTO, TEXTO_INICIAL, leerTexto } from './texto.js';
import { DIARIOS, SECUNDARIOS, destinosDeBarra, destinosDeMas } from './navegacion.js';
import { CLAVE_SESION, SESION_INICIAL } from './sesion.js';
import { reiniciarEstadoSync } from './sync.js';

/**
 * Cascaron (Shell): las dos distribuciones, la honestidad del estado de sync y
 * el tamano de letra. La red esta apagada desde `test/setup.ts`: si el header o
 * el control de letra hicieran `fetch`, el test rompe.
 *
 * Lo que se prueba es el comportamiento, no el CSS: cuantos destinos hay, que
 * texto tiene cada estado y que la eleccion sobreviva a una recarga. El rail y
 * la barra inferior existen a la vez en el DOM (el CSS muestra uno); por eso se
 * buscan por su nombre accesible, no por posicion.
 */

function montarApp(ruta = '/padron') {
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

/** Destinos de la barra inferior del telefono, por nombre accesible. */
function enlacesDeBarra(): readonly HTMLElement[] {
  const barra = screen.getByRole('navigation', { name: 'Secciones' });
  return within(barra).getAllByRole('link');
}

/** Destinos del rail de escritorio. */
function enlacesDelRail(): readonly HTMLElement[] {
  const rail = screen.getByRole('navigation', { name: 'Secciones principales' });
  return within(rail).getAllByRole('link');
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.texto;
  reiniciarEstadoSync();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  delete document.documentElement.dataset.texto;
});

describe('cascaron', () => {
  it('la barra del telefono muestra solo los diarios de la cocinera; "Más" sigue para el contexto', () => {
    montarApp('/servicio');

    const barra = enlacesDeBarra();
    // Cocinera: servicio y comprobante. Padron y plata son de la organizadora.
    expect(barra).toHaveLength(2);
    expect(barra.map((a) => a.textContent)).toEqual(['Servir', 'Boleta']);

    // "Más" siempre esta: ahi viven las secciones extra Y la hoja de contexto.
    // Para la cocinera la hoja no tiene enlaces, pero el boton no desaparece.
    const mas = screen.getByRole('button', { name: /Más/i });
    expect(mas).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mas);
    expect(mas).toHaveAttribute('aria-expanded', 'true');
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    const nombres = within(hoja)
      .getAllByRole('link')
      .map((a) => a.textContent ?? '');
    // Cada enlace concatena `descripcion` + `tarea` sin espacio entre ambos.
    // La cocinera tiene Recetario y Despensa en "Más"; lo demas es de otros roles.
    expect(nombres).toHaveLength(2);
    expect(nombres.some((t) => t.includes('Recetario'))).toBe(true);
    expect(nombres.some((t) => t.includes('Despensa'))).toBe(true);
  });

  it('la hoja "Más" se cierra con Escape y no queda tapando la accion', () => {
    window.localStorage.setItem(
      CLAVE_SESION,
      JSON.stringify({ ...SESION_INICIAL, rol: 'organizadora' }),
    );
    montarApp('/padron');
    fireEvent.click(screen.getByRole('button', { name: /Más/i }));
    expect(screen.getByRole('navigation', { name: 'Más secciones' })).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(screen.queryByRole('navigation', { name: 'Más secciones' })).toBeNull();
    expect(screen.getByRole('button', { name: /Más/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('el rail de escritorio lista las secciones del rol, en dos grupos', () => {
    // Organizadora: 8 de 10 destinos (recetas, permisos y despensa incluidos).
    window.localStorage.setItem(
      CLAVE_SESION,
      JSON.stringify({ ...SESION_INICIAL, rol: 'organizadora' }),
    );
    montarApp('/padron');

    const rail = enlacesDelRail();
    expect(rail).toHaveLength(8);
    expect(rail.map((a) => a.textContent)).toEqual([
      'Padrón',
      'Presupuesto',
      'Precios de insumos',
      'Entre ollas',
      'Reporte entre ollas',
      'Recetario',
      'Consentimiento',
      'Despensa',
    ]);

    // El rail agrupa en "Día a día" y "Otros"; "Entre ollas" es ademas una pantalla.
    const navegacion = screen.getByRole('navigation', { name: 'Secciones principales' });
    expect(within(navegacion).getByText('Día a día')).toBeInTheDocument();
    expect(within(navegacion).getByText('Otros')).toBeInTheDocument();
    expect(within(navegacion).getAllByText('Entre ollas')).toHaveLength(1);

    // La pantalla actual se marca sola (NavLink pone aria-current="page").
    expect(within(navegacion).getByRole('link', { name: 'Padrón' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('el tamaño de letra se guarda como preferencia local y sobrevive a recargar, sin red', () => {
    const { unmount } = montarApp('/padron');
    const rail = screen.getByRole('navigation', { name: 'Secciones principales' });
    const normal = within(screen.getByRole('complementary')).getByRole('button', {
      name: 'Letra normal',
    });
    expect(normal).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.texto).toBeUndefined();

    act(() => {
      fireEvent.click(
        within(screen.getByRole('complementary')).getByRole('button', { name: 'Letra grande' }),
      );
    });

    // Se guardo donde tiene que guardarse: preferencia local, no Dexie.
    expect(window.localStorage.getItem(CLAVE_TEXTO)).toBe('grande');
    expect(document.documentElement.dataset.texto).toBe('grande');
    expect(rail).toBeInTheDocument();

    // Recarga: se desmonta la app entera y se vuelve a abrir.
    unmount();
    document.documentElement.removeAttribute('data-texto');
    montarApp('/padron');

    // Se lee de localStorage al montar: sigue en grande.
    expect(leerTexto()).toBe('grande');
    expect(document.documentElement.dataset.texto).toBe('grande');

    // Volver a normal borra el atributo en vez de dejar un estado muerto.
    act(() => {
      fireEvent.click(
        within(screen.getByRole('complementary')).getByRole('button', { name: 'Letra normal' }),
      );
    });
    expect(document.documentElement.dataset.texto).toBeUndefined();

    // Nada de esto salio a la red.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('el header dice "En este dispositivo", nunca que ya sincronizo', () => {
    montarApp('/padron');

    // Lo que importa: el texto no promete sincronizacion.
    expect(screen.getByText('En este dispositivo')).toBeInTheDocument();
    expect(screen.queryByText(/sincronizado|al día|al dia/i)).toBeNull();
  });

  it('el header nombra la seccion actual y no repite el nombre en la barra', () => {
    montarApp('/comprobante');

    const encabezado = screen.getByRole('banner');
    expect(within(encabezado).getByText('Comprobante')).toBeInTheDocument();
  });

  it('las reglas de navegacion no repiten destinos entre la barra y "Más"', () => {
    // Contrato del modelo, sin DOM. Admin es el unico que ve todo, asi que
    // sirve para verificar que barra + hoja parten el menu sin repetir.
    const todo = { rol: 'admin' as const };
    const barraDeAdmin = destinosDeBarra(todo).map((d) => d.a);
    const hojaDeAdmin = destinosDeMas(todo).map((d) => d.a);
    expect(new Set([...barraDeAdmin, ...hojaDeAdmin]).size).toBe(
      barraDeAdmin.length + hojaDeAdmin.length,
    );
    // Barra + hoja es exactamente lo que el rol puede ver, sin faltar ni sobrar.
    expect([...barraDeAdmin, ...hojaDeAdmin]).toEqual([...DIARIOS, ...SECUNDARIOS].map((d) => d.a));
    // Admin: los cuatro diarios y los seis secundarios (recetas, permisos, despensa).
    expect(barraDeAdmin).toHaveLength(4);
    expect(hojaDeAdmin).toHaveLength(6);
    expect(TEXTO_INICIAL).toBe('normal');
  });
});
