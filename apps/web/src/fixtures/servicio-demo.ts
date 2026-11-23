/**
 * Menu firmado de DEMO y padron de DEMO para la pantalla de servicio.
 *
 * Todo es ficticio y evidente: la olla es `olla-demo-01`, el nutricionista se
 * llama "Nutricionista Demo" y las porciones son las que ya firma el seed del
 * dominio (`supabase/seed.sql`, plantilla 301). No se inventa ninguna cifra de
 * nutricion: se reusan las porciones firmadas del seed (DEC-2026-0003).
 *
 * El `sello.hash` NO se inventa: es el SHA-256 que `servirDelDia` calcula sobre
 * `serializarContenido` de este mismo menu (coincide con `HASH_SEED_301` del
 * dominio y con el literal de `supabase/seed.sql`). Si cambia el contenido del
 * dia, el hash deja de cuadrar y el menu deja de ser servible: por eso la
 * pantalla muestra el error y no un numero a mano.
 */
import type { MenuTemplate, Persona, Portion, Substitution } from '@hackods/contracts';
import type { MenuOpcion, PlatoServicio } from '@hackods/domain';

/** Misma olla demo que el resto de `apps/web/src/fixtures` (`repositorio.ts`). */
export const OLLA_DEMO_SERVICIO = 'olla-demo-01';

/** Plantilla general/A del seed, firmada. */
export const TEMPLATE_DEMO_301 = '00000000-0000-4000-8000-000000000301';
/** Plantilla especial/A del seed, aprobada y sin platos. */
export const TEMPLATE_DEMO_302 = '00000000-0000-4000-8000-000000000302';

/**
 * Hash real del contenido del dia, calculado con
 * `sha256Hex(serializarContenido(...))` sobre el menu de abajo. Es el mismo
 * literal que `HASH_SEED_301` en el seed del dominio.
 */
export const HASH_DEMO_302 =
  'c04067aad4bfd6296660faf68af661c65a733b072661db6e380aff606d93efb7';

export const HASH_DEMO_301 =
  'cd78df14a1e79cb92c9eb73047c32220e2aaff23339243d0ca78b524dfbcec39';

const DISH = '00000000-0000-4000-8000-000000000501';

function porcion(
  id: string,
  dishId: string,
  grupo: Portion['grupo'],
  cantidad: number,
): Portion {
  return {
    id,
    dishId,
    grupo,
    cantidad,
    unidad: 'g',
    version: 1,
    hash: `hash-${id}`,
  };
}

/**
 * Platos del dia (forma de las filas `dish`/`portion`). Las porciones son las
 * firmadas del seed: adulto 280 g, menor_5 180 g y gestante 320 g.
 */
export function platosDemo(): readonly PlatoServicio[] {
  return [
    {
      id: DISH,
      momento: 'almuerzo',
      titulo: 'Guiso demo de lentejas',
      insumos: ['lentejas', 'papa'],
      porciones: [
        porcion('00000000-0000-4000-8000-000000000701', DISH, 'adulto', 280),
        porcion('00000000-0000-4000-8000-000000000702', DISH, 'menor_5', 180),
        porcion('00000000-0000-4000-8000-000000000703', DISH, 'gestante', 320),
      ],
    },
  ];
}

const sello = {
  nutricionista: 'Nutricionista Demo',
  cnp: 'CNP-DEMO-0001',
  fecha: '2026-11-01T10:00:00Z',
  version: 1,
  hash: HASH_DEMO_301,
} as const;

/** Plantilla general/A (publicada) firmada con `HASH_DEMO_301`. */
export function plantillaDemo301(): MenuTemplate {
  return {
    id: TEMPLATE_DEMO_301,
    ollaId: OLLA_DEMO_SERVICIO,
    perfil: 'general',
    opcion: 'A',
    estado: 'publicado',
    sello,
    version: 1,
    hash: HASH_DEMO_301,
  };
}

/**
 * Plantilla especial/A (aprobada) sin platos: en el seed no aporta gramos. Su
 * hash es el del contenido vacio, no el de la 301.
 */
export function plantillaDemo302(): MenuTemplate {
  return {
    id: TEMPLATE_DEMO_302,
    ollaId: OLLA_DEMO_SERVICIO,
    perfil: 'especial',
    opcion: 'A',
    estado: 'aprobado',
    sello: { ...sello, hash: HASH_DEMO_302 },
    version: 1,
    hash: HASH_DEMO_302,
  };
}

/**
 * Sustitucion aprobada de la 302 del seed: leche evaporada -> quinua x1.20.
 * La 301 no la aplica, porque solo cuentan las aprobadas PARA su plantilla.
 */
export function sustitucionesDemo(): readonly Substitution[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000000901',
      templateId: TEMPLATE_DEMO_302,
      insumoOrigenId: 'leche_evaporada',
      insumoDestinoId: 'quinua',
      factor: 1.2,
      aprobadaPor: 'CNP-DEMO-0001',
      version: 1,
      hash: 'hash-subs-leche-quinua',
    },
  ];
}

/** Las dos opciones firmadas del dia (301 general/A con platos, 302 especial/A). */
export function menusDelDiaDemo(): readonly MenuOpcion[] {
  return [
    {
      template: plantillaDemo301(),
      platos: platosDemo(),
      sustituciones: sustitucionesDemo(),
    },
    {
      template: plantillaDemo302(),
      platos: [],
      sustituciones: sustitucionesDemo(),
    },
  ];
}

export function persona(
  codigoP: string,
  categoria: Persona['categoria'],
  deletedAt: string | null = null,
): Persona {
  return {
    codigoP,
    ollaId: OLLA_DEMO_SERVICIO,
    anioNacimiento: 1990,
    sexo: 'F',
    categoria,
    anemia: 'sin_dato',
    pesoKg: null,
    tallaCm: null,
    consentimientoSeguimiento: false,
    notas: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt,
    deviceId: 'dispositivo-demo-01',
    lamport: 0,
  };
}

/**
 * Padron de DEMO: 5 personas vigentes (una por categoria) y una baja logica
 * (P-0006). El total de raciones sale de aca, no de una constante.
 */
export function padronDemo(): readonly Persona[] {
  return [
    persona('P-0001', 'gestante'),
    persona('P-0002', 'nino'),
    persona('P-0003', 'adulto_mayor'),
    persona('P-0004', 'adulto'),
    persona('P-0005', 'lactante'),
    persona('P-0006', 'adulto', '2026-11-20T10:00:00Z'),
  ];
}