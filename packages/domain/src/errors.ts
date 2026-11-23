/**
 * Errores de dominio. Se lanzan cuando la operacion no es valida, no cuando falta un
 * dato opcional (para eso esta `insuficiente_datos` en el motor nutricional).
 */
export class ErrorDominio extends Error {
  override name = 'ErrorDominio';
}

export class OllaCerrada extends ErrorDominio {
  override name = 'OllaCerrada';
}

export class ServicioDuplicado extends ErrorDominio {
  override name = 'ServicioDuplicado';
}

export class DatoFaltante extends ErrorDominio {
  override name = 'DatoFaltante';
}

/**
 * Transicion de estado no permitida en una solicitud entre ollas.
 * Lleva el estado actual y el pedido, para que la pantalla diga que se intento.
 */
export class TransicionInvalida extends ErrorDominio {
  override name = 'TransicionInvalida';

  constructor(
    readonly estadoActual: string,
    readonly intento: string,
  ) {
    super(`solicitud: no se puede pasar de "${estadoActual}" a "${intento}"`);
  }
}

/**
 * Unidad de captura sin equivalencia fija a la unidad base (g). Se rechaza en
 * vez de suponer un factor: `taza` de arroz no son gramos sin una tabla.
 */
export class UnidadNoSoportada extends ErrorDominio {
  override name = 'UnidadNoSoportada';

  constructor(
    readonly unidad: string,
    readonly insumoId: string,
  ) {
    super(`solicitud: la unidad "${unidad}" de "${insumoId}" no tiene factor a gramos`);
  }
}

/** El esqueleto no implementa la funcion todavia: falla ruidosamente en vez de mentir. */
export class NoImplementado extends ErrorDominio {
  override name = 'NoImplementado';

  constructor(fn: string) {
    super(`${fn}(): pendiente de implementacion (esqueleto M0)`);
  }
}
