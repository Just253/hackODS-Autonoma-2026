/**
 * Convierte lo grabado por `MediaRecorder` (webm/opus en Chrome, mp4 en Safari)
 * a WAV PCM 16 bits antes de subirlo.
 *
 * Por qué: el compute transcribe WAV sin depender de ffmpeg; con `audio/webm`
 * respondía 500. El navegador ya sabe decodificar el blob (`decodeAudioData`),
 * así que la conversión no necesita librerías ni servidor.
 */
export async function aWav(blob: Blob): Promise<File> {
  const Contexto =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Contexto === undefined) {
    throw new Error('este navegador no puede convertir el audio');
  }

  const contexto = new Contexto();
  try {
    const audio = await contexto.decodeAudioData(await blob.arrayBuffer());
    const canales = audio.numberOfChannels;
    const muestras = audio.length;
    const frecuencia = audio.sampleRate;
    const bytesPorMuestra = 2;
    const tamanoDatos = muestras * canales * bytesPorMuestra;
    const buffer = new ArrayBuffer(44 + tamanoDatos);
    const vista = new DataView(buffer);

    const texto = (posicion: number, valor: string): void => {
      for (let i = 0; i < valor.length; i += 1) {
        vista.setUint8(posicion + i, valor.charCodeAt(i));
      }
    };

    texto(0, 'RIFF');
    vista.setUint32(4, 36 + tamanoDatos, true);
    texto(8, 'WAVE');
    texto(12, 'fmt ');
    vista.setUint32(16, 16, true);
    vista.setUint16(20, 1, true); // PCM
    vista.setUint16(22, canales, true);
    vista.setUint32(24, frecuencia, true);
    vista.setUint32(28, frecuencia * canales * bytesPorMuestra, true);
    vista.setUint16(32, canales * bytesPorMuestra, true);
    vista.setUint16(34, 16, true);
    texto(36, 'data');
    vista.setUint32(40, tamanoDatos, true);

    const pistas: Float32Array[] = [];
    for (let canal = 0; canal < canales; canal += 1) pistas.push(audio.getChannelData(canal));

    let posicion = 44;
    for (let i = 0; i < muestras; i += 1) {
      for (let canal = 0; canal < canales; canal += 1) {
        const muestra = Math.max(-1, Math.min(1, pistas[canal]?.[i] ?? 0));
        vista.setInt16(posicion, muestra < 0 ? muestra * 0x8000 : muestra * 0x7fff, true);
        posicion += bytesPorMuestra;
      }
    }

    return new File([buffer], 'dictado.wav', { type: 'audio/wav' });
  } finally {
    await contexto.close();
  }
}
