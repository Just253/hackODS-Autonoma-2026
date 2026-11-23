import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';

import type { Insumo, MotivoMovimiento, UnidadBase } from '@hackods/contracts';
import {
  formatearCentimos,
  parsearCaptura,
  redondearMitadArriba,
  stockPorInsumo,
  urgenciaVencimiento,
  type UrgenciaVencimiento,
} from '@hackods/domain';
import { BotonGrande, EncabezadoPantalla, EstadoPantalla } from '@hackods/ui';

import { INSUMOS_DEMO, TEXTO_ENTRADA_DEMO } from '../../fixtures/inventario-demo.js';
import type { Lote } from '../../data/base.js';
import { capturarConIngest } from '../../data/funciones-supabase.js';
import {
  listarInsumos,
  listarLotes,
  listarMovimientos,
  registrarMovimiento,
  sembrarInsumos,
} from '../../data/inventario.js';
import { OLLA_DEMO } from '../../data/repositorio.js';
import { estadoConexion } from '../../data/supabase.js';

/**
 * Despensa (issue #69): stock derivado de movimientos, vencimiento por lote,
 * entrada por texto y dictado.
 *
 * Las cuentas NO viven aca: `stockPorInsumo` y `urgenciaVencimiento` son de
 * `@hackods/domain` (`packages/domain/src/racion.ts`). Esta pantalla traduce a
 * textos y decide que mostrar; no suma saldos ni compara umbrales por su
 * cuenta.
 *
 * Tres reglas del producto que se ven en la interfaz:
 * - Nada se edita: lo que esta mal se corrige con otro movimiento (`ajuste`).
 * - Un dato que falta dice `sin dato`; nunca se completa con un promedio.
 * - El dictado y la foto usan la Edge `ingest` con la sesión de la olla; sin
 *   sesión quedan deshabilitados y se escribe a mano. Ninguna clave vive en el
 *   cliente (el `COMPUTE_TOKEN` es un secret de la función).
 */

export type MotivoRegistrable = Extract<MotivoMovimiento, 'entrada' | 'salida' | 'merma' | 'ajuste'>;

const ROLES: readonly { readonly valor: string; readonly texto: string }[] = [
  { valor: 'cocinera', texto: 'Cocinera' },
  { valor: 'organizadora', texto: 'Organizadora' },
  { valor: 'nutricionista', texto: 'Nutricionista' },
  { valor: 'admin', texto: 'Administración' },
];

const MOTIVOS: readonly { readonly valor: MotivoRegistrable; readonly texto: string }[] = [
  { valor: 'entrada', texto: 'Entrada (compra o donación)' },
  { valor: 'salida', texto: 'Salida (se cocinó)' },
  { valor: 'merma', texto: 'Merma (se echó a perder)' },
  { valor: 'ajuste', texto: 'Ajuste (corrección de conteo)' },
];

const ETIQUETA_UNIDAD: Readonly<Record<UnidadBase, string>> = {
  g: 'gramos',
  ml: 'mililitros',
  unidad: 'unidades',
};

const TEXTO_URGENCIA: Readonly<Record<UrgenciaVencimiento, string>> = {
  vencido: 'venció',
  vence_3: 'vence en 3 días o menos',
  vence_7: 'vence esta semana',
  vence_15: 'vence en 15 días o menos',
  vigente: 'vigente',
  sin_dato: 'sin dato',
};

/** Fecha de hoy del dispositivo en ISO corto; se inyecta para poder probar. */
export function hoyDelDispositivo(ahora: Date = new Date()): string {
  return ahora.toISOString().slice(0, 10);
}

/** "2026-11-30" -> "30/11/2026". Sin ISO en pantalla (`copy-visible`). */
export function formatearFechaCorta(iso: string | null): string {
  if (iso === null || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return 'sin dato';
  }
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Cantidad en unidad base a algo que se lee de pie: "5 kg", "750 ml", "30 unidades". */
export function formatearCantidadBase(cantidad: number, unidad: UnidadBase): string {
  if (unidad === 'unidad') {
    const redondeada = redondearMitadArriba(cantidad * 100) / 100;
    return `${redondeada} ${redondeada === 1 ? 'unidad' : 'unidades'}`;
  }
  if (Math.abs(cantidad) >= 1000) {
    const enGrande = redondearMitadArriba((cantidad / 1000) * 100) / 100;
    return unidad === 'g' ? `${enGrande} kg` : `${enGrande} L`;
  }
  return `${redondearMitadArriba(cantidad * 100) / 100} ${unidad}`;
}

/**
 * Normaliza una denominación para emparejar el texto pegado con el catálogo.
 * Mismo criterio que el parser: sin acentos, en minúsculas, sin espacios de más.
 */
export function normalizarDenominacion(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export interface FilaEntrada {
  readonly lineaNo: number;
  readonly descripcion: string;
  readonly insumoId: string | null;
  readonly cantidadBase: number | null;
  readonly unidadBase: UnidadBase | null;
  readonly precioTotalCentavos: number | null;
  readonly precioUnitarioCentavos: number | null;
  /** Por que no se puede registrar tal cual. `null` = se puede. */
  readonly motivoSinDato: string | null;
}

export interface PropuestaEntrada {
  readonly filas: readonly FilaEntrada[];
  /** Un aviso que toca dinero (monto sin repartir, numero ambiguo): no se confirma. */
  readonly bloquea: boolean;
  readonly avisos: readonly string[];
  readonly registrables: number;
}

/**
 * Avisos que la pantalla muestra cuando una línea pegada no se puede
 * registrar. Exportado para que la guardia de copy (`copy-visible.test.tsx`)
 * los lea: sólo salen después de "Revisar texto", así que un render estático no
 * los alcanza y un voseo ahí pasaría desapercibido.
 */
export const AVISOS_HUMANOS: Readonly<Record<string, string>> = {
  MONTO_SIN_REPARTIR: 'Hay un solo monto para varios productos: no se reparte solo.',
  NUMERO_AMBIGUO: 'Hay más de un número en la línea y no se sabe cuál es el precio.',
  PRECIO_AMBIGUO: 'El precio no se puede confirmar.',
  PRECIO_FUERA_DE_RANGO: 'El precio está muy lejos de lo habitual: revísalo.',
  ARITMETICA_NO_CUADRA: 'Las cuentas de la línea no cuadran.',
  CANTIDAD_IMPOSIBLE: 'La cantidad no es posible.',
  SIN_CANTIDAD: 'Una línea no dice cuánto.',
  SIN_PRECIO: 'Una línea no dice el precio.',
  PRODUCTO_AMBIGUO: 'El producto se conoce, pero conviene revisar la cantidad.',
  CANTIDAD_SUPUESTA: 'Se supuso una unidad porque no se dijo.',
  UNIDAD_SIN_EQUIVALENCIA: 'La presentación no tiene equivalencia a la unidad del catálogo.',
  FRACCION_SIN_UNIDAD: 'La fracción no dice la unidad.',
  TOTAL_CALCULADO: 'El total se calculó con la cantidad y el precio unitario.',
};

/**
 * Texto pegado -> filas revisables. Es determinista: el parser de
 * `@hackods/domain` hace el trabajo y aca solo se empareja con el catalogo.
 * Lo que no se entiende queda con `motivoSinDato` y NO se registra.
 */
export function prepararEntrada(
  texto: string,
  insumos: readonly Insumo[],
): PropuestaEntrada {
  const resultado = parsearCaptura(texto);
  const porNombre = new Map<string, Insumo>();
  for (const insumo of insumos) {
    porNombre.set(normalizarDenominacion(insumo.denominacion), insumo);
  }

  const filas: FilaEntrada[] = resultado.items.map((item) => {
    const insumo = porNombre.get(normalizarDenominacion(item.descripcion)) ?? null;
    let motivoSinDato: string | null = null;

    if (insumo === null) {
      motivoSinDato = 'no está en el catálogo';
    } else if (item.cantidadMilesimas === null || item.unidadBase === null) {
      motivoSinDato = 'no dice cuánto';
    } else if (item.unidadBase !== insumo.unidadBase) {
      // No se inventa una equivalencia: kg->g lo hace el parser, pero una
      // presentación (saco, docena) no tiene factor y no se supone.
      motivoSinDato = `viene en ${ETIQUETA_UNIDAD[item.unidadBase]} y el catálogo lo lleva en ${ETIQUETA_UNIDAD[insumo.unidadBase]}`;
    }

    const cantidadBase =
      motivoSinDato === null && item.cantidadMilesimas !== null
        ? redondearMitadArriba((Number(item.cantidadMilesimas) / 1000) * 100) / 100
        : null;

    return {
      lineaNo: item.lineaNo,
      descripcion: item.descripcion,
      insumoId: insumo?.id ?? null,
      cantidadBase,
      unidadBase: insumo?.unidadBase ?? null,
      precioTotalCentavos: item.precioTotalCentavos === null ? null : Number(item.precioTotalCentavos),
      precioUnitarioCentavos:
        item.precioUnitarioCentavos === null ? null : Number(item.precioUnitarioCentavos),
      motivoSinDato,
    };
  });

  const avisos = resultado.avisos.map((aviso) => AVISOS_HUMANOS[aviso] ?? aviso);

  return {
    filas,
    bloquea: resultado.bloqueaConfirmacion,
    avisos,
    registrables: filas.filter((fila) => fila.motivoSinDato === null && fila.cantidadBase !== null)
      .length,
  };
}

/**
 * Capacidad de captura: la Edge `ingest` exige JWT. Sin sesión, el botón queda
 * deshabilitado y se escribe a mano; el navegador no conoce el compute.
 */
export function puedeCapturar(): boolean {
  return estadoConexion() === 'autenticado';
}

interface Formulario {
  insumoId: string;
  motivo: MotivoRegistrable;
  cantidad: string;
  sentido: 'suma' | 'descuenta';
  rol: string;
  fecha: string;
  vencimiento: string;
  /** Lote existente al que se imputa una salida, merma o ajuste. */
  loteId: string;
}

export function InventarioPantalla({
  insumosIniciales,
  estadoInicial,
}: {
  /**
   * Lo que la pantalla muestra antes de leer Dexie. Sin esto arranca vacía y
   * `cargando`, que es la verdad en la app. La guardia de copy necesita el
   * listado ya cargado para revisar el catálogo, y un test del estado vacío
   * necesita arrancar sin insumos: son los dos caminos que da este prop.
   */
  readonly insumosIniciales?: readonly Insumo[];
  /** `cargando` por defecto; un test lo pone en `listo` con los datos ya puestos. */
  readonly estadoInicial?: 'cargando' | 'listo';
} = {}) {
  const [cargando, setCargando] = useState(estadoInicial !== 'listo');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [insumos, setInsumos] = useState<readonly Insumo[]>(insumosIniciales ?? []);
  const [movimientos, setMovimientos] = useState<Awaited<ReturnType<typeof listarMovimientos>>>([]);
  const [lotes, setLotes] = useState<readonly Lote[]>([]);
  const [texto, setTexto] = useState('');
  const [propuesta, setPropuesta] = useState<PropuestaEntrada | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [dictado, setDictado] = useState<'inactivo' | 'transcribiendo' | 'error'>('inactivo');
  const [grabando, setGrabando] = useState(false);
  const grabador = useRef<MediaRecorder | null>(null);
  const trozosAudio = useRef<Blob[]>([]);
  const entradaFoto = useRef<HTMLInputElement>(null);
  const [capturaFoto, setCapturaFoto] = useState<'inactivo' | 'subiendo' | 'error'>('inactivo');

  const hoy = hoyDelDispositivo();
  const haySesion = puedeCapturar();

  const [formulario, setFormulario] = useState<Formulario>({
    insumoId: '',
    motivo: 'entrada',
    cantidad: '',
    sentido: 'suma',
    rol: 'cocinera',
    fecha: hoy,
    vencimiento: '',
    loteId: '',
  });

  const recargar = async (): Promise<void> => {
    await sembrarInsumos(INSUMOS_DEMO, OLLA_DEMO);
    const [listaInsumos, listaMovimientos, listaLotes] = await Promise.all([
      listarInsumos(OLLA_DEMO),
      listarMovimientos(OLLA_DEMO),
      listarLotes(OLLA_DEMO),
    ]);
    setInsumos(listaInsumos);
    setMovimientos(listaMovimientos);
    setLotes(listaLotes);
  };

  useEffect(() => {
    let vigente = true;
    recargar()
      .then(() => {
        if (vigente) setCargando(false);
      })
      .catch(() => {
        if (vigente) {
          setCargando(false);
          setError('No se pudo leer la despensa de este dispositivo.');
        }
      });
    return () => {
      vigente = false;
    };
    // Se ejecuta una sola vez: `recargar` solo lee la misma olla.
  }, []);

  const cambiar = <C extends keyof Formulario>(campo: C, valor: Formulario[C]): void => {
    setFormulario((f) => ({ ...f, [campo]: valor }));
  };

  const elegirInsumo = (lista: readonly Insumo[]): Insumo | undefined =>
    lista.find((insumo) => insumo.id === formulario.insumoId) ?? lista[0];

  const guardarMovimiento = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const insumo = elegirInsumo(insumos);
    if (insumo === undefined) {
      setError('Todavía no hay insumos en el catálogo de esta olla.');
      return;
    }
    const cantidad = Number(formulario.cantidad.replace(',', '.'));
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError('La cantidad tiene que ser un número mayor que cero.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formulario.fecha)) {
      setError('Elige la fecha del movimiento.');
      return;
    }
    const nuevoLote =
      formulario.motivo === 'entrada' && formulario.vencimiento !== ''
        ? { fechaVencimiento: formulario.vencimiento }
        : null;
    if (nuevoLote !== null && nuevoLote.fechaVencimiento < formulario.fecha) {
      setError('El vencimiento no puede ser anterior a la fecha del movimiento.');
      return;
    }

    const delta =
      formulario.motivo === 'entrada'
        ? cantidad
        : formulario.motivo === 'ajuste'
          ? formulario.sentido === 'suma'
            ? cantidad
            : -cantidad
          : -cantidad;

    setGuardando(true);
    registrarMovimiento(
      {
        insumoId: insumo.id,
        delta,
        motivo: formulario.motivo,
        autor: formulario.rol,
        at: `${formulario.fecha}T12:00:00.000Z`,
        // Una entrada abre lote con su vencimiento; el resto se imputa a un lote existente.
        loteId: formulario.motivo === 'entrada' || formulario.loteId === '' ? null : formulario.loteId,
        nuevoLote,
      },
      undefined,
      OLLA_DEMO,
    )
      .then(async () => {
        await recargar();
        setFormulario((f) => ({ ...f, cantidad: '', vencimiento: '', loteId: '' }));
        setAviso(
          `Movimiento guardado en este dispositivo: ${formatearCantidadBase(
            Math.abs(delta),
            insumo.unidadBase,
          )} de ${insumo.denominacion}.`,
        );
      })
      .catch(() => {
        setError('No se pudo guardar el movimiento en el dispositivo. Intenta otra vez.');
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  const revisarTexto = (): void => {
    setError(null);
    setAviso(null);
    setPropuesta(null);
    if (texto.trim() === '') {
      setError('Pega o dicta al menos un producto.');
      return;
    }
    try {
      setPropuesta(prepararEntrada(texto, insumos));
    } catch {
      setError('No se pudo leer el texto. Revisa que no sea demasiado largo.');
    }
  };

  const confirmarTexto = (): void => {
    if (propuesta === null || propuesta.bloquea || propuesta.registrables === 0) {
      return;
    }
    setError(null);
    setAviso(null);
    setGuardando(true);

    const filas = propuesta.filas.filter(
      (fila) => fila.insumoId !== null && fila.cantidadBase !== null && fila.motivoSinDato === null,
    );

    Promise.all(
      filas.map((fila) =>
        registrarMovimiento(
          {
            insumoId: fila.insumoId ?? '',
            delta: fila.cantidadBase ?? 0,
            motivo: 'entrada',
            autor: formulario.rol,
          },
          undefined,
          OLLA_DEMO,
        ),
      ),
    )
      .then(async () => {
        await recargar();
        const sinDato = propuesta.filas.length - filas.length;
        setAviso(
          `Se registraron ${filas.length} ${filas.length === 1 ? 'entrada' : 'entradas'} en este dispositivo.` +
            (sinDato > 0 ? ` ${sinDato} línea(s) sin dato no se registraron.` : ''),
        );
        setTexto('');
        setPropuesta(null);
      })
      .catch(() => {
        setError('Alguna entrada no se pudo guardar. Revisa la lista antes de reintentar.');
      })
      .finally(() => {
        setGuardando(false);
      });
  };

  /**
   * Audio o foto -> Edge `ingest` -> ítems -> cuadro de texto. El texto que se
   * agrega es el `textoCrudo` de cada ítem (lo que la Edge entendió), no una
   * cifra inventada. Si falla, se avisa y el cuadro queda como estaba.
   */
  const enviarCaptura = async (archivo: File, tipo: 'audio' | 'boleta'): Promise<void> => {
    const marcarEnvio = (): void => {
      if (tipo === 'audio') setDictado('transcribiendo');
      else setCapturaFoto('subiendo');
    };
    const marcarFin = (estado: 'inactivo' | 'error'): void => {
      if (tipo === 'audio') setDictado(estado);
      else setCapturaFoto(estado);
    };
    marcarEnvio();
    setError(null);

    try {
      const respuesta = await capturarConIngest(archivo, tipo);
      if (respuesta.datos === null) {
        throw new Error(respuesta.error ?? 'sin respuesta de la ingesta');
      }
      const items = respuesta.datos.items ?? [];
      const textoNuevo =
        items.length > 0
          ? items.map((item) => item.textoCrudo).join(', ')
          : respuesta.datos.texto;
      if (textoNuevo.trim() === '') {
        throw new Error('la captura no trae texto');
      }
      setTexto((previo) => (previo === '' ? textoNuevo : `${previo}, ${textoNuevo}`));
      marcarFin('inactivo');
    } catch (fallo) {
      marcarFin('error');
      setError(fallo instanceof Error ? fallo.message : 'no se pudo leer la captura');
    }
  };

  /** Foto de boleta: el input de cámara sigue siendo un archivo. */
  const capturarFotoArchivo = (evento: ChangeEvent<HTMLInputElement>): void => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (archivo !== undefined) void enviarCaptura(archivo, 'boleta');
  };

  /**
   * Dictado con el micrófono del equipo. Graba con `MediaRecorder`, y al tocar
   * «Detener» manda el audio a la Edge. Si el navegador no graba o el permiso
   * se niega, lo dice y deja el cuadro de texto: nunca pide "subir un audio".
   */
  const alternarGrabacion = (): void => {
    if (!haySesion) return;

    if (grabando) {
      grabador.current?.stop();
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      navigator.mediaDevices?.getUserMedia === undefined ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError('Este navegador no permite grabar audio. Escribí o pegá el texto a mano.');
      return;
    }

    const empezar = async (): Promise<void> => {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(flujo);
      trozosAudio.current = [];
      rec.ondataavailable = (evento) => {
        if (evento.data.size > 0) trozosAudio.current.push(evento.data);
      };
      rec.onstop = () => {
        for (const pista of flujo.getTracks()) pista.stop();
        setGrabando(false);
        const tipo = rec.mimeType === '' ? 'audio/webm' : rec.mimeType;
        const blob = new Blob(trozosAudio.current, { type: tipo });
        const archivo = new File([blob], 'dictado.webm', { type: tipo });
        void enviarCaptura(archivo, 'audio');
      };
      grabador.current = rec;
      rec.start();
      setGrabando(true);
      setError(null);
    };

    empezar().catch(() => {
      setGrabando(false);
      setError('No se pudo abrir el micrófono. Revisá el permiso o escribí el texto a mano.');
    });
  };

  const filasStock = stockPorInsumo(insumos, movimientos);
  const porId = new Map(insumos.map((insumo) => [insumo.id, insumo]));
  const bajoMinimo = filasStock.filter((fila) => fila.bajoMinimo);
  const lotesDisponibles = lotes.filter((lote) => lote.estado === 'disponible');
  const lotesPorInsumo = new Map<string, Lote[]>();
  for (const lote of lotesDisponibles) {
    lotesPorInsumo.set(lote.insumoId, [...(lotesPorInsumo.get(lote.insumoId) ?? []), lote]);
  }
  const proximoVencimiento = (insumoId: string): Lote | null => {
    const lista = (lotesPorInsumo.get(insumoId) ?? [])
      .filter((lote) => lote.fechaVencimiento !== null)
      .sort((a, b) => String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento)));
    return lista[0] ?? null;
  };
  const insumoDelFormulario = elegirInsumo(insumos);
  const lotesDelFormulario = lotesPorInsumo.get(insumoDelFormulario?.id ?? '') ?? [];
  const vencimientosConAlerta = lotesDisponibles
    .map((lote) => ({ lote, urgencia: urgenciaVencimiento(lote.fechaVencimiento, hoy) }))
    .filter(({ urgencia }) => urgencia === 'vencido' || urgencia === 'vence_3' || urgencia === 'vence_7' || urgencia === 'vence_15')
    .sort((a, b) =>
      String(a.lote.fechaVencimiento).localeCompare(String(b.lote.fechaVencimiento)),
    );

  return (
    <section className="flex flex-col gap-4 lg:gap-6" aria-busy={cargando}>
      <EncabezadoPantalla
        titulo="Despensa"
        descripcion="El stock sale de los movimientos guardados en esta tablet. Nada se edita: si algo está mal, se corrige con un ajuste."
      />

      {error !== null ? <EstadoPantalla estado="error">{error}</EstadoPantalla> : null}
      {/*
        Un solo bloque de estados, en la misma posición: cargando · error ·
        vacío. El de vacío antes vivía dentro de la lista de insumos, después de
        las alertas; con la siembra de `recargar` (`sembrarInsumos`) nunca se
        veía, y cuando se viera quedaba abajo de todo. Ahora se lee antes de las
        alertas: primero "hay o no hay", después "qué ojo hay que poner".
      */}
      {cargando ? (
        <EstadoPantalla estado="cargando">
          Leyendo la despensa guardada en este dispositivo…
        </EstadoPantalla>
      ) : insumos.length === 0 ? (
        <div className="oc-tarjeta flex flex-col gap-1" data-estado="vacio">
          <span className="oc-estado__etiqueta text-texto-suave">Despensa vacía</span>
          <p>
            Todavía no hay insumos cargados en esta olla. El catálogo llega con el menú firmado;
            mientras tanto se puede cargar a mano lo que hay en la despensa, abajo.
          </p>
        </div>
      ) : null}
      {aviso !== null ? (
        <div
          role="status"
          className="oc-tarjeta border-primario bg-primario-suave text-sm"
          data-estado="movimiento-guardado"
        >
          {aviso} Todavía no se envía a ninguna parte.
        </div>
      ) : null}

      {/* Alertas: stock mínimo y vencimiento próximo. Se leen antes de la lista,
          y sólo cuando hay insumos: con la despensa vacía "ningún insumo está
          por debajo de su mínimo" es cierto y no dice nada. */}
      {insumos.length > 0 ? (
        <div className="flex flex-col gap-2" aria-label="Alertas de la despensa">
          {bajoMinimo.length > 0 ? (
            <div className="oc-estado" data-estado="alerta" data-tono="atencion" role="status">
              <span className="oc-estado__etiqueta">Atención</span>
              <p>
                {bajoMinimo.length === 1
                  ? '1 insumo está bajo el mínimo: '
                  : `${bajoMinimo.length} insumos están bajo el mínimo: `}
                {bajoMinimo
                  .map((fila) => porId.get(fila.insumoId)?.denominacion ?? fila.insumoId)
                  .join(', ')}
                .
              </p>
            </div>
          ) : (
            <p className="text-sm text-texto-suave" data-estado="stock-ok">
              Ningún insumo está por debajo de su mínimo.
            </p>
          )}

          {vencimientosConAlerta.length > 0 ? (
            <div className="oc-estado" data-estado="error" data-tono="critica" role="status">
              <span className="oc-estado__etiqueta">Vencimiento</span>
              <ul className="flex flex-col gap-1">
                {vencimientosConAlerta.map(({ lote, urgencia }) => (
                  <li key={lote.loteId}>
                    {porId.get(lote.insumoId)?.denominacion ?? lote.insumoId}:{' '}
                    {TEXTO_URGENCIA[urgencia]} el {formatearFechaCorta(lote.fechaVencimiento)}.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Lista de insumos con stock derivado. El estado vacío ya se pintó
          arriba: acá solo queda la lista, sin un segundo mensaje. */}
      {insumos.length > 0 ? (
        <section aria-label="Insumos y stock" className="oc-tarjeta flex flex-col divide-y divide-borde">
          <p className="pb-3 text-lg font-bold">Insumos de la olla</p>
          <ul className="flex flex-col divide-y divide-borde">
            {filasStock.map((fila) => {
              const insumo = porId.get(fila.insumoId);
              if (insumo === undefined) {
                return null;
              }
              const lote = proximoVencimiento(fila.insumoId);
              const urgencia = urgenciaVencimiento(lote?.fechaVencimiento ?? null, hoy);

              return (
                <li
                  key={fila.insumoId}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3"
                  data-estado={fila.bajoMinimo ? 'stock-bajo' : 'stock-ok'}
                  data-vence={urgencia}
                >
                  <span className="font-semibold">
                    {insumo.denominacion}
                    <span className="block text-xs font-normal text-texto-suave">
                      Mínimo: {formatearCantidadBase(insumo.stockMinimo, insumo.unidadBase)} ·{' '}
                      {ETIQUETA_UNIDAD[insumo.unidadBase]}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="text-lg font-bold tabular-nums">
                      {formatearCantidadBase(fila.saldo, insumo.unidadBase)}
                    </span>
                    <span className="block text-xs text-texto-suave">
                      {fila.bajoMinimo ? 'bajo el mínimo' : 'con stock'}
                      {' · '}
                      {urgencia === 'sin_dato' ? 'sin dato de vencimiento' : TEXTO_URGENCIA[urgencia]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        {/* Alta manual de movimiento. */}
        <form
          onSubmit={guardarMovimiento}
          className="oc-tarjeta flex flex-col gap-3"
          aria-label="Alta de movimiento"
        >
          <p className="text-lg font-bold">Movimiento</p>
          <p className="text-sm text-texto-suave">
            Entrada, salida, merma o ajuste. Queda con autor, fecha y, si corresponde, lote.
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Insumo</span>
            <select
              name="insumoId"
              className="oc-campo"
              value={formulario.insumoId === '' ? (insumoDelFormulario?.id ?? '') : formulario.insumoId}
              onChange={(e) =>
                setFormulario((f) => ({ ...f, insumoId: e.target.value, loteId: '' }))
              }
            >
              {insumos.map((insumo) => (
                <option key={insumo.id} value={insumo.id}>
                  {insumo.denominacion}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Motivo</span>
              <select
                name="motivo"
                className="oc-campo"
                value={formulario.motivo}
                onChange={(e) => cambiar('motivo', e.target.value as MotivoRegistrable)}
              >
                {MOTIVOS.map((motivo) => (
                  <option key={motivo.valor} value={motivo.valor}>
                    {motivo.texto}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">
                Cantidad ({insumoDelFormulario === undefined ? 'unidad' : ETIQUETA_UNIDAD[insumoDelFormulario.unidadBase]})
              </span>
              <input
                name="cantidad"
                inputMode="decimal"
                autoComplete="off"
                className="oc-campo"
                value={formulario.cantidad}
                onChange={(e) => cambiar('cantidad', e.target.value)}
              />
            </label>

            {formulario.motivo === 'ajuste' ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Sentido del ajuste</span>
                <select
                  name="sentido"
                  className="oc-campo"
                  value={formulario.sentido}
                  onChange={(e) => cambiar('sentido', e.target.value as Formulario['sentido'])}
                >
                  <option value="suma">Suma al stock</option>
                  <option value="descuenta">Descuenta del stock</option>
                </select>
              </label>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Fecha</span>
              <input
                type="date"
                name="fecha"
                className="oc-campo"
                value={formulario.fecha}
                onChange={(e) => cambiar('fecha', e.target.value)}
              />
            </label>

            {formulario.motivo === 'entrada' ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Vencimiento del lote</span>
                <span className="text-xs text-texto-suave">Opcional. Sin fecha queda sin dato.</span>
                <input
                  type="date"
                  name="vencimiento"
                  className="oc-campo"
                  value={formulario.vencimiento}
                  onChange={(e) => cambiar('vencimiento', e.target.value)}
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold">Lote</span>
                <span className="text-xs text-texto-suave">
                  {lotesDelFormulario.length === 0
                    ? 'Este insumo no tiene lotes con fecha.'
                    : 'De dónde sale lo que se descuenta.'}
                </span>
                <select
                  name="loteId"
                  className="oc-campo"
                  value={formulario.loteId}
                  onChange={(e) => cambiar('loteId', e.target.value)}
                  disabled={lotesDelFormulario.length === 0}
                >
                  <option value="">Sin lote</option>
                  {lotesDelFormulario.map((lote) => (
                    <option key={lote.loteId} value={lote.loteId}>
                      {`Vence ${formatearFechaCorta(lote.fechaVencimiento)} · ${formatearCantidadBase(
                        lote.cantidadInicial,
                        insumoDelFormulario?.unidadBase ?? 'unidad',
                      )}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Autor</span>
              <select
                name="rol"
                className="oc-campo"
                value={formulario.rol}
                onChange={(e) => cambiar('rol', e.target.value)}
              >
                {ROLES.map((rol) => (
                  <option key={rol.valor} value={rol.valor}>
                    {rol.texto}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="[&>button]:w-full">
            <BotonGrande type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Registrar movimiento'}
            </BotonGrande>
          </div>
        </form>

        {/* Entrada por texto y dictado. */}
        <div className="flex flex-col gap-4">
          <section className="oc-tarjeta flex flex-col gap-3" aria-label="Entrada por texto">
            <p className="text-lg font-bold">Entrada por texto</p>
            <p className="text-sm text-texto-suave">
              Pega lo de la compra, por ejemplo: «{TEXTO_ENTRADA_DEMO}». Se muestra lo que se
              entendió antes de guardar; lo que no, dice «sin dato».
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Texto</span>
              <textarea
                name="texto"
                rows={3}
                className="oc-campo"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <BotonGrande variante="secundario" onClick={revisarTexto}>
                Revisar texto
              </BotonGrande>

              <BotonGrande
                variante={grabando ? 'primario' : 'secundario'}
                disabled={!haySesion || dictado === 'transcribiendo'}
                onClick={alternarGrabacion}
              >
                {dictado === 'transcribiendo'
                  ? 'Transcribiendo…'
                  : grabando
                    ? 'Detener y transcribir'
                    : 'Dictar'}
              </BotonGrande>
              <BotonGrande
                variante="secundario"
                disabled={!haySesion || capturaFoto === 'subiendo'}
                onClick={() => entradaFoto.current?.click()}
              >
                {capturaFoto === 'subiendo' ? 'Leyendo foto…' : 'Subir foto'}
              </BotonGrande>
              <input
                ref={entradaFoto}
                type="file"
                accept="image/png,image/jpeg"
                capture="environment"
                aria-label="Foto de la boleta"
                className="hidden"
                onChange={capturarFotoArchivo}
              />
            </div>

            {grabando ? (
              <p className="text-sm font-semibold text-primario" role="status">
                Grabando… hablá y tocá «Detener y transcribir».
              </p>
            ) : null}

            {!haySesion ? (
              <p className="text-sm text-texto-suave" data-estado="dictado-no-configurado">
                Dictado y foto: <strong>iniciá sesión</strong> para usarlos. Mientras tanto,
                escribe o pega el texto a mano.
              </p>
            ) : (
              <p className="text-sm text-texto-suave">
                El audio o la foto se mandan a la ingesta de tu olla y vuelven como ítems. Si
                falla, el cuadro de arriba queda como está.
              </p>
            )}

            {dictado === 'error' || capturaFoto === 'error' ? (
              <EstadoPantalla estado="error">
                No se pudo leer la captura{error === null ? '' : `: ${error}`}. Escribe o pega el
                texto a mano: no se pierde nada.
              </EstadoPantalla>
            ) : null}

            {propuesta === null ? null : (
              <div className="flex flex-col gap-3" data-estado="propuesta">
                <p className="text-sm font-semibold">Antes de confirmar</p>
                <ul className="flex flex-col divide-y divide-borde">
                  {propuesta.filas.map((fila) => (
                    <li
                      key={fila.lineaNo}
                      className="flex flex-col gap-1 py-2"
                      data-registrable={fila.motivoSinDato === null ? 'si' : 'no'}
                    >
                      <span className="font-semibold">{fila.descripcion}</span>
                      <span className="text-sm text-texto-suave">
                        {fila.cantidadBase === null || fila.unidadBase === null
                          ? 'sin dato'
                          : formatearCantidadBase(fila.cantidadBase, fila.unidadBase)}
                        {' · '}
                        {fila.precioTotalCentavos === null
                          ? 'precio sin dato'
                          : `total ${formatearCentimos(fila.precioTotalCentavos)}`}
                        {fila.precioUnitarioCentavos === null
                          ? ''
                          : ` · unitario ${formatearCentimos(fila.precioUnitarioCentavos)}`}
                      </span>
                      {fila.motivoSinDato === null ? null : (
                        <span className="text-sm text-error">sin dato — {fila.motivoSinDato}</span>
                      )}
                    </li>
                  ))}
                </ul>

                {propuesta.avisos.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-sm text-texto-suave">
                    {propuesta.avisos.map((aviso) => (
                      <li key={aviso}>{aviso}</li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-sm text-texto-suave">
                  El precio se muestra para revisar; esta pantalla solo registra cantidades. Los
                  precios de la boleta se cargan en su propia pantalla.
                </p>

                <div className="[&>button]:w-full">
                  <BotonGrande
                    disabled={guardando || propuesta.bloquea || propuesta.registrables === 0}
                    onClick={confirmarTexto}
                  >
                    {propuesta.bloquea
                      ? 'No se puede confirmar: revisa los números'
                      : `Confirmar entrada (${propuesta.registrables})`}
                  </BotonGrande>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
