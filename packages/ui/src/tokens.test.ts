import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * La escala de letra (`html { font-size: var(--texto-base) }`) no cambia sola:
 * cambia si TODO lo que se mide adentro esta en `rem`. Un `text-xs` de Tailwind
 * 4 es `0.75rem`; un `12px` suelto en un css de componente no se entera de
 * `data-texto` y el control queda desproporcionado mientras el resto crece
 * (bug reportado: "cada que seleccionamos la letra, sale de los recuadros").
 *
 * Esta prueba lee el archivo, no un navegador: cubre la DECLARACION (unidades
 * de la escala y de `.oc-boton`), no el layout real. Que los tres pasos quepan
 * en 240 px de rail a 26 px de base se verifica en `apps/web/src/app/shell.test.tsx`
 * (clases del contenedor) y, de verdad, mirando la pantalla.
 */
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** Cuerpo de una regla por selector exacto, sin comentarios. */
function regla(selector: string): string {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const encontrada = new RegExp(`(?:^|\\n)\\s*${escapado}\\s*\\{([^}]*)\\}`, 'm').exec(
    sinComentarios,
  );
  if (encontrada === null) throw new Error(`no existe la regla ${selector} en tokens.css`);
  return encontrada[1] ?? '';
}

describe('tokens de tamano de letra', () => {
  it('los tres pasos escalan la base y la base es la que fija html', () => {
    expect(regla(':root')).toMatch(/--texto-base:\s*18px/);
    expect(regla("html[data-texto='grande']")).toMatch(/--texto-base:\s*22px/);
    expect(regla("html[data-texto='enorme']")).toMatch(/--texto-base:\s*26px/);
    // Un solo lugar mueve la escala: si `html` fijara `16px`, `rem` no escala.
    expect(regla('html')).toMatch(/font-size:\s*var\(--texto-base\)/);
  });

  it('el boton compartido mide en rem, no en px sueltos', () => {
    const boton = regla('.oc-boton');
    expect(boton).toMatch(/font:\s*inherit/);
    // Cualquier `px` en el padding del boton es un padding que no escala: a
    // `enorme` el rail de 240 px se queda con menos lugar para el texto.
    expect(boton).toMatch(/padding:\s*[\d.]+rem\s+[\d.]+rem/);
    expect(boton).not.toMatch(/font-size:\s*\d+px/);
  });

  it('el rail de escritorio crece con la letra: si no, el control de letra no se alcanza', () => {
    // Estuvo en `240px`. A `data-texto='enorme'` (26 px de base) el control de
    // tamaño de letra no entraba en el rail y, con `#root` en `overflow: hidden`,
    // quedaba fuera de pantalla: se subía a enorme y no se podía volver. En
    // `rem` el ancho escala con la misma base que el contenido del rail.
    const rail = regla(':root');
    expect(rail).toMatch(/--ancho-rail:\s*[\d.]+rem/);
    expect(rail).not.toMatch(/--ancho-rail:\s*\d+px/);
  });
});
