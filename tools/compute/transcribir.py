#!/usr/bin/env python
"""Transcribe un audio con faster-whisper y devuelve JSON de una línea.

Uso:  python transcribir.py <archivo> [modelo] [max_segundos] [idioma]

Lo llama `servicio.mjs` (issue #64) una vez por pedido. No guarda nada: el
archivo ya viene de un temporal y el que lo borra es quien lo creó.

Salida (stdout, una sola línea):
  {"ok":true,"texto":"...","idioma":"es","duracionS":5.96,
   "segmentos":[{"inicio":0.0,"fin":5.12,"texto":"..."}],
   "motor":"faster-whisper small","dispositivo":"cuda"}

o

  {"ok":false,"codigo":"AUDIO_LARGO","message":"..."}

Los avisos de NumPy/Torch van a stderr y no rompen nada: el servicio lee stdout.
"""
import json
import os
import sys

# En Windows stdout suele ser cp1252: sin esto, un acento en el texto transcripto
# hace fallar el print y una transcripción buena se reporta como error.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 - si no se puede, queda el codec del sistema
    pass


def salir_error(codigo, mensaje):
    print(json.dumps({"ok": False, "codigo": codigo, "message": mensaje}, ensure_ascii=False))
    sys.exit(0)


def main():
    if len(sys.argv) < 2:
        salir_error("USO", "Falta la ruta del audio.")

    ruta = sys.argv[1]
    modelo = sys.argv[2] if len(sys.argv) > 2 else "small"
    max_segundos = float(sys.argv[3]) if len(sys.argv) > 3 else 120.0
    idioma = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None

    if not os.path.isfile(ruta):
        salir_error("AUDIO_ILEGIBLE", "No existe el archivo temporal del audio.")

    try:
        from faster_whisper import WhisperModel
        from faster_whisper.audio import decode_audio
    except Exception as e:  # noqa: BLE001 - se informa, no se propaga
        salir_error("ASR_NO_DISPONIBLE", f"faster-whisper no se pudo importar: {type(e).__name__}: {e}")

    # Decodificar ANTES de cargar el modelo: así el limite de duración se mide sobre
    # el audio real (un webm de MediaRecorder no siempre declara duración en el contenedor).
    try:
        audio = decode_audio(ruta, sampling_rate=16000)
    except Exception as e:  # noqa: BLE001
        salir_error("AUDIO_ILEGIBLE", f"No se pudo decodificar el audio: {type(e).__name__}")

    duracion = len(audio) / 16000.0
    if duracion <= 0:
        salir_error("AUDIO_ILEGIBLE", "El audio no tiene muestras.")
    if duracion > max_segundos:
        salir_error(
            "AUDIO_LARGO",
            f"El audio dura {duracion:.1f} s y el limite es {max_segundos:.0f} s.",
        )

    errores = []
    # cuda+float16 si la máquina puede; si no, CPU+int8. Nunca se baja un modelo nuevo:
    # el nombre que llega es el que ya está en la caché de Hugging Face.
    for dispositivo, tipo_computo in (("cuda", "float16"), ("cpu", "int8")):
        try:
            motor = WhisperModel(modelo, device=dispositivo, compute_type=tipo_computo)
            segmentos_crudos, info = motor.transcribe(
                audio,
                language=idioma,
                beam_size=5,
                vad_filter=True,
            )
            segmentos = [
                {"inicio": round(s.start, 2), "fin": round(s.end, 2), "texto": s.text.strip()}
                for s in segmentos_crudos
            ]
            texto = " ".join(s["texto"] for s in segmentos if s["texto"]).strip()
            print(
                json.dumps(
                    {
                        "ok": True,
                        "texto": texto,
                        "idioma": info.language,
                        "duracionS": round(duracion, 2),
                        "segmentos": segmentos,
                        "motor": f"faster-whisper {modelo}",
                        "dispositivo": dispositivo,
                    },
                    ensure_ascii=False,
                )
            )
            return
        except Exception as e:  # noqa: BLE001
            errores.append(f"{dispositivo}: {type(e).__name__}: {e}")

    salir_error("ASR_FALLO", " | ".join(errores)[:500])


if __name__ == "__main__":
    main()
