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

export class JornadaDuplicada extends ErrorDominio {
  override name = 'JornadaDuplicada';
}

export class DatoFaltante extends ErrorDominio {
  override name = 'DatoFaltante';
}

/** El esqueleto no implementa la funcion todavia: falla ruidosamente en vez de mentir. */
export class NoImplementado extends ErrorDominio {
  override name = 'NoImplementado';

  constructor(fn: string) {
    super(`${fn}(): pendiente de implementacion (esqueleto M0)`);
  }
}
