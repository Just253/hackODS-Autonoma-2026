import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dexie from 'dexie';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nutrienteIdSchema, racionSchema } from '@hackods/contracts';

import { SESION_INICIAL, cambiarRol, guardarSesion } from './app/sesion.js';
import { baseDeOlla, cerrarBases } from './data/base.js';
import {
  OLLA_DEMO,
  RacionDuplicada,
  altaPersona,
  guardarRacion,
  identidadDe,
  listarPersonas,
  racionDe,
  servicioDelDia,
} from './data/repositorio.js';
import { crearRouterDePrueba } from './app/router.js';

/**
 * Prueba exigida por el issue #1: alta -> desmontar -> remontar -> la racion
 * sigue. Simula el modo avion: `fetch` esta apagado desde `test/setup.ts`, asi
 * que si algun camino lo llama, el test rompe en vez de "pasar con red".
 */

const AZAR_FIJO = (): number => 0.1; // indice entero en el alfabeto: 'D', estable

const RELOJ_FIJO = { ahora: () => '2026-11-23T10:00:00.000Z', azar: AZAR_FIJO } as const;

function montarApp(ruta = '/padron') {
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

/**
 * Borra la base del demo entre tests.
 *
 * Se borra por nombre directo y NO con `indexedDB.databases()`: esa API no
 * siempre lista las bases creadas, y una base que sobrevive deja personas de
 * otro test y un `codigoP` que no es el esperado. `onblocked` no es exito: si
 * queda una conexion abierta, el borrado no ocurre y el test mentiria.
 */
async function limpiarBaseDePrueba(): Promise<void> {
  cerrarBases();
  await new Promise<void>((listo, falla) => {
    const pedido = indexedDB.deleteDatabase(`hackods-${OLLA_DEMO}`);
    pedido.onsuccess = () => listo();
    pedido.onerror = () => falla(pedido.error ?? new Error('no se pudo borrar la base'));
    pedido.onblocked = () => falla(new Error('borrado bloqueado: hay una conexion abierta'));
  });
}

beforeEach(async () => {
  await limpiarBaseDePrueba();
  // Codigo P-DDDD predecible en cada corrida.
  vi.spyOn(Math, 'random').mockReturnValue(AZAR_FIJO());
});

/**
 * Entra con el rol que de verdad tiene esa pantalla en la matriz (FE-02). El
 * padron es solo de la organizadora; servicio y comprobante, de la cocinera.
 * Se siembra el rol, no se debilita la guarda.
 */
function entrarComo(rol: 'cocinera' | 'organizadora') {
  guardarSesion(cambiarRol(SESION_INICIAL, rol));
}

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await limpiarBaseDePrueba();
  localStorage.clear();
});

describe('esqueleto offline', () => {
  it('alta P-XXXX -> desmontar -> remontar -> la racion sigue en pantalla', async () => {
    // 1. Alta de una persona ficticia en el dispositivo, sin red. El alta ya no
    // vive en el padrón (esa pantalla lee Supabase); el repositorio local sigue
    // siendo el camino offline y es lo que este test cubre.
    entrarComo('organizadora');
    const { unmount } = montarApp('/padron');
    await screen.findByText('Conecta Supabase para ver el padrón');

    const alta = await altaPersona(
      {
        anioNacimiento: 1958,
        sexo: 'F',
        categoria: 'adulto_mayor',
        nombreLocal: 'Alias ficticio',
        alias: 'Alias ficticio',
      },
      RELOJ_FIJO,
    );
    const codigoP = alta.persona.codigoP;
    expect(codigoP).toBe('P-DDDD');

    // 2. Racion con dos razones.
    // Servir es tarea de la cocinera: se cambia el rol como lo haria una persona
    // que comparte la tablet, no se salta la guarda.
    unmount();
    entrarComo('cocinera');
    montarApp('/servicio');
    await screen.findByText(/raciones registradas/i);
    // El total sale del padron real: una persona, una racion en cada opcion (no una constante).
    const totales = screen.getAllByTestId('total-raciones');
    expect(totales).toHaveLength(2);
    for (const total of totales) {
      expect(total).toHaveTextContent('Total de raciones: 1');
    }

    fireEvent.change(screen.getByLabelText(/^Razón 1$/i), {
      target: { value: 'Porción por grupo de edad según el menú firmado' },
    });
    fireEvent.change(screen.getByLabelText(/^Razón 2$/i), {
      target: { value: 'Equivalencia aprobada de insumo agotado' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Servir ración/i }));
    });

    expect(await screen.findByText(/Ración de P-DDDD guardada/i)).toBeInTheDocument();

    // 3. Recarga con la red apagada: se desmonta la app entera y se vuelve a abrir.
    unmount();
    montarApp('/servicio');

    // 4. La racion sigue en pantalla, leida de IndexedDB, sin una sola request.
    expect(
      await screen.findByText(/Ración registrada · guardada en esta tablet/i),
    ).toBeInTheDocument();
    // El codigo aparece en la fila y en el resumen: basta con que este presente.
    expect(screen.getAllByText(codigoP!).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();

    // 5. Detras del DOM, el contrato se cumple: >= 2 razones y sin PII.
    //
    // La comprobacion de PII mira las DOS entidades que algun dia saldrian del
    // dispositivo (`persona` y `racion`) y el objeto que NO debe salir
    // (`identidadLocal`). Mirar solo `racion` seria vacuo: el alias nunca entra
    // a su construccion, asi que esa asercion pasaria con el producto roto.
    // Aca, si `altaPersona` filtrara el alias hacia `persona` o si el
    // serializador lo metiera en la racion, el test falla.
    const [persona] = await listarPersonas();
    expect(persona?.codigoP).toBe(codigoP);

    const racion = await racionDe('P-DDDD');
    expect(racion?.razones).toHaveLength(2);
    expect(racion?.razones.every((r) => r.trim() !== '')).toBe(true);

    const identidad = await identidadDe('P-DDDD');
    expect(identidad?.localOnly).toBe(true);
    expect(identidad?.alias).toBe('Alias ficticio');

    // Lo sincronizable no lleva el alias; lo local saido si, y nada mas.
    expect(JSON.stringify(persona)).not.toContain('Alias ficticio');
    expect(JSON.stringify(racion)).not.toContain('Alias ficticio');
  });

  it('rechaza la racion con una sola razon y no escribe nada', async () => {
    await altaPersona(
      {
        anioNacimiento: 1990,
        sexo: 'F',
        categoria: 'adulto',
        nombreLocal: null,
        alias: null,
      },
      RELOJ_FIJO,
    );

    montarApp('/servicio');
    await screen.findByText(/raciones registradas/i);
    // El total sale del padron real: una persona, una racion en cada opcion (no una constante).
    const totales = screen.getAllByTestId('total-raciones');
    expect(totales).toHaveLength(2);
    for (const total of totales) {
      expect(total).toHaveTextContent('Total de raciones: 1');
    }
    fireEvent.change(screen.getByLabelText(/^Razón 1$/i), {
      target: { value: 'Una sola razon no alcanza' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Servir ración/i }));
    });

    // Sin "al menos 2" en el texto: el numero es del contrato, no de la pantalla.
    expect(await screen.findByRole('alert')).toHaveTextContent(/faltan razones/i);
    await waitFor(async () => {
      expect(await racionDe('P-DDDD')).toBeUndefined();
    });
  });
});

/**
 * Las raciones, sin pantalla: lo que se prueba es lo que queda en Dexie, no el
 * `if` de `ServicioPage`.
 */
describe('raciones en Dexie', () => {
  const SERVICIO_DEL_DIA = servicioDelDia(RELOJ_FIJO);
  const DOS_RAZONES = ['Porción por grupo de edad', 'Equivalencia aprobada'] as const;

  async function altaDePrueba(): Promise<void> {
    await altaPersona(
      {
        anioNacimiento: 1990,
        sexo: 'F',
        categoria: 'adulto',
        nombreLocal: null,
        alias: null,
      },
      RELOJ_FIJO,
    );
  }

  it('una racion sin calculo guarda 0 en cada nutriente del contrato', async () => {
    await altaDePrueba();
    await guardarRacion(
      { personaCodigoP: 'P-DDDD', servicioId: SERVICIO_DEL_DIA, razones: DOS_RAZONES },
      RELOJ_FIJO,
    );

    const racion = await racionDe('P-DDDD', OLLA_DEMO, SERVICIO_DEL_DIA);
    expect(racion).toBeDefined();
    const { cobertura, componentes } = racion!;

    // Las claves se comparan contra `nutrienteIdSchema.options`, no contra una
    // lista copiada: si `COBERTURA_SIN_CALCULO` pierde una clave, esto falla; si
    // el contrato suma un nutriente, se exige en 0 sin tocar el test.
    expect(Object.keys(cobertura).sort()).toEqual([...nutrienteIdSchema.options].sort());
    for (const nutriente of nutrienteIdSchema.options) {
      expect(cobertura[nutriente]).toBe(0);
    }
    // Hoy son 8; el numero sale del contrato, no de este archivo.
    expect(nutrienteIdSchema.options).toHaveLength(Object.keys(cobertura).length);

    // "Sin calculo" tambien significa sin componentes: no se inventan gramos.
    expect(componentes).toEqual([]);
  });

  it('append-only: dos servicios de la misma persona son dos filas y el duplicado no pisa', async () => {
    await altaDePrueba();
    const ayer = 'servicio-2026-11-22';

    await guardarRacion(
      { personaCodigoP: 'P-DDDD', servicioId: SERVICIO_DEL_DIA, razones: DOS_RAZONES },
      RELOJ_FIJO,
    );
    await guardarRacion(
      { personaCodigoP: 'P-DDDD', servicioId: ayer, razones: DOS_RAZONES },
      RELOJ_FIJO,
    );
    expect(await baseDeOlla(OLLA_DEMO).raciones.count()).toBe(2);

    // Misma persona y mismo servicio: error explicito, no un `put` silencioso.
    await expect(
      guardarRacion(
        {
          personaCodigoP: 'P-DDDD',
          servicioId: SERVICIO_DEL_DIA,
          razones: ['Otra razón', 'Que no debe pisar la primera'],
        },
        RELOJ_FIJO,
      ),
    ).rejects.toBeInstanceOf(RacionDuplicada);

    const racion = await racionDe('P-DDDD', OLLA_DEMO, SERVICIO_DEL_DIA);
    expect(racion?.razones).toEqual([...DOS_RAZONES]);
    expect(await baseDeOlla(OLLA_DEMO).raciones.count()).toBe(2);
  });

  it('el contrato rechaza una sola razon antes de escribir', async () => {
    await altaDePrueba();
    const unaSola = ['Una sola razon no alcanza'];

    // El limite es de `racionSchema.razones`; el test lo ejerce en el contrato.
    expect(racionSchema.shape.razones.safeParse(unaSola).success).toBe(false);
    expect(racionSchema.shape.razones.safeParse([...DOS_RAZONES]).success).toBe(true);

    await expect(
      guardarRacion(
        { personaCodigoP: 'P-DDDD', servicioId: SERVICIO_DEL_DIA, razones: unaSola },
        RELOJ_FIJO,
      ),
    ).rejects.toThrow();

    expect(await baseDeOlla(OLLA_DEMO).raciones.count()).toBe(0);
  });

  it('abre una base v1 (clave personaCodigoP) sin romper y estrena la clave compuesta', async () => {
    // La base que dejo el build anterior: PK de una racion por persona.
    const v1 = new Dexie(`hackods-${OLLA_DEMO}`);
    v1.version(1).stores({
      personas: 'codigoP, categoria, anioNacimiento',
      raciones: 'personaCodigoP, servicioId',
      identidadLocal: 'codigoP',
      meta: 'clave',
    });
    await v1.table('raciones').add({
      personaCodigoP: 'P-AAAA',
      servicioId: null,
      razones: [...DOS_RAZONES],
    });
    v1.close();

    // Dexie no cambia una PK en el lugar: v2 tira la tabla y v3 la recrea. Si
    // esa migracion faltara, esto seria `UpgradeError` y la app no abriria.
    expect(await baseDeOlla(OLLA_DEMO).raciones.count()).toBe(0);

    await altaDePrueba();
    await guardarRacion(
      { personaCodigoP: 'P-DDDD', servicioId: SERVICIO_DEL_DIA, razones: DOS_RAZONES },
      RELOJ_FIJO,
    );
    expect(await racionDe('P-DDDD', OLLA_DEMO, SERVICIO_DEL_DIA)).toBeDefined();
  });
});
