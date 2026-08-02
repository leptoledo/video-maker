"""
Transcrição super-rápida e estável (macOS seguro) usando faster-whisper.
Remove a dependência do PyTorch multiprocessing (VAD do whisperx) que causa deadlocks eternos no macOS M1/M2/M3.
"""

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import json
import sys
import multiprocessing

def main():
    video_path = sys.argv[1]
    saida = sys.argv[2]
    modelo = sys.argv[3] if len(sys.argv) > 3 else "medium"
    idioma = sys.argv[4] if len(sys.argv) > 4 else "pt"

    from faster_whisper import WhisperModel

    device = "cpu"
    # No Mac, float32 acelera usando o Apple Accelerate framework nativo do macOS
    compute_type = "float32"
    
    cpu_cores = min(multiprocessing.cpu_count(), 8)

    print(f"[WhisperX (Faster)] Carregando modelo {modelo} ({device}/{compute_type}, {cpu_cores} threads)...", flush=True)
    # Inicializa diretamente o motor ctranslate2 super-rápido, evitando o pytorch/pyannote
    model = WhisperModel(modelo, device=device, compute_type=compute_type, cpu_threads=cpu_cores)

    print("[WhisperX (Faster)] Transcrevendo... (muito mais rápido e sem travamentos)", flush=True)
    try:
        segments, info = model.transcribe(video_path, language=idioma, vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500))
        
        segmentos_json = []
        for segment in segments:
            segmentos_json.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "words": [] # lctnet_video_maker ignora isso, só usa start e text
            })
            
        print(f"[WhisperX (Faster)] Transcrição concluída, {len(segmentos_json)} segmentos gerados.", flush=True)

        with open(saida, "w", encoding="utf-8") as f:
            json.dump(segmentos_json, f, ensure_ascii=False, indent=2)

        print(f"[WhisperX (Faster)] OK: {len(segmentos_json)} segmentos salvos em {saida}", flush=True)

    except Exception as e:
        import traceback
        print(f"[WhisperX CRASH] Erro durante a transcrição: {e}", flush=True)
        traceback.print_exc()
        import os
        os._exit(1)

    import os
    os._exit(0)

if __name__ == "__main__":
    main()
