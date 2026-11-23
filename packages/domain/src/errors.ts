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

/** El esqueleto no implementa la funcion todavia: falla ruidosamente en vez de mentir. */
export class NoImplementado extends ErrorDominio {
  override name = 'NoImplementado';

  constructor(fn: string) {
    super(`${fn}(): pendiente de implementacion (esqueleto M0)`);
  }
}

/**
 * El menu no se puede servir: falta el sello, no esta publicado o el hash no
 * corresponde. `campo` dice exactamente que fallo (`estado`, `sello`, `sello.hash`,
 * `sello.version`, `porcion.<grupo>`).
 */
export class MenuNoServible extends ErrorDominio {
  override name = 'MenuNoServible';

  constructor(
    readonly menuId: string,
    readonly campo: string,
    readonly detalle: string,
  ) {
    super(`menu ${menuId}: no servible por "${campo}": ${detalle}`);
  }
}
