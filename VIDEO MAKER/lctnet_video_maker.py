"""
LCTNET VIDEO MAKER  —  servidor local + interface no navegador
Mesma identidade visual e animações do LCTNET FLOW (extensão Chrome).

Fluxo:
  Áudio → WhisperX (venv local) → SRT → [colar no Claude/ChatGPT] → Prompts
        → gerar imagens no LCTNET FLOW → selecionar pasta → montar vídeo MP4

Como rodar:
  python lctnet_video_maker.py
  (abre sozinho no navegador padrão em http://127.0.0.1:8777)
"""

import os, re, sys, json, base64, threading, tempfile, subprocess, webbrowser
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# ─────────────────────────────────────────────────────────────────
# Caminhos / ambiente do projeto
# ─────────────────────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    # Se estiver rodando como executável compilado pelo PyInstaller
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    # Se estiver rodando como script Python normal
    BASE_DIR = Path(__file__).resolve().parent

if os.name == 'nt':
    WHISPER_PY = BASE_DIR / "whisperx_env" / "Scripts" / "python.exe"
else:
    WHISPER_PY = BASE_DIR / "whisperx_env" / "bin" / "python"

WHISPER_SCRIPT = BASE_DIR / "transcrever_whisperx.py"
LOGO_PATH    = BASE_DIR / "logo.png"
PORT         = 8777

# Configuração de transcrição (lida do config.json do projeto, com defaults)
def _load_cfg():
    try:
        cfg = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
        t = cfg.get("transcricao", {})
        return t.get("modelo_whisper", "small"), t.get("idioma", "pt")
    except Exception:
        return "small", "pt"

WHISPER_MODEL, WHISPER_LANG = _load_cfg()


def ffmpeg_exe():
    """ffmpeg portátil (imageio-ffmpeg) ou o do PATH como fallback."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _full_config():
    """config.json completo (para o gerador de draft do CapCut)."""
    try:
        return json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


# ─────────────────────────────────────────────────────────────────
# Prompt de instruções (colar no Claude/ChatGPT antes do SRT)
# ─────────────────────────────────────────────────────────────────
PASTE_INSTRUCTIONS = """Você é um gerador de prompts de imagem para um canal de animação doodle (bonecos palito) no YouTube.

Vou colar abaixo uma transcrição com timestamps. Gere UM prompt de imagem em inglês para CADA linha com timestamp — não pule nenhuma.

REGRAS DE ESTILO — aplique IDÊNTICAS em TODOS os prompts:
• Abertura:  "Hand-drawn 2D doodle cartoon animation, flat colors, bold black outlines, slightly imperfect sketchy marker lines,"
• Fechamento:  "no gradients, no shadows, no textures, no photorealism, no 3D, 16:9 aspect ratio, educational YouTube explainer doodle style."
• Personagens: simple stick figures, large circular heads, dot eyes, thick expressive brow lines
• Fundos: cor sólida chapada — white (padrão), green+blue sky (externo), orange (fogo/antigo), dark blue (noite), tan (caverna/deserto)
• Texto na tela: bold ALL CAPS marker font, RED/BLACK/YELLOW, no TOPO do quadro

FORMATO:
• Cada prompt começa com seu timestamp: [MM:SS]
• Traduza a narração em cenas visuais concretas — nada abstrato
• Segure a mesma cena em timestamps consecutivos que descrevem o mesmo momento
• Uma linha em branco entre cada prompt
• Mantenha a ordem cronológica
• Entregue TODOS os prompts. Se for muito longo, entregue em partes e eu digito "next".

═══════════════════════════════════════════
TRANSCRIÇÃO COM TIMESTAMPS:
═══════════════════════════════════════════

"""

# QR Code Pix (estático, gerado do BR Code da chave do Lctnet — CRC validado)
PIX_QR_PATH = "M0 0h7v1h-7zM13 0h2v1h-2zM16 0h1v1h-1zM20 0h2v1h-2zM23 0h1v1h-1zM25 0h2v1h-2zM28 0h1v1h-1zM30 0h2v1h-2zM35 0h1v1h-1zM42 0h1v1h-1zM46 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM9 1h2v1h-2zM12 1h1v1h-1zM16 1h1v1h-1zM19 1h1v1h-1zM21 1h1v1h-1zM26 1h2v1h-2zM29 1h1v1h-1zM31 1h1v1h-1zM35 1h1v1h-1zM37 1h1v1h-1zM39 1h1v1h-1zM42 1h2v1h-2zM46 1h1v1h-1zM52 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM11 2h1v1h-1zM18 2h1v1h-1zM20 2h2v1h-2zM23 2h1v1h-1zM25 2h2v1h-2zM29 2h2v1h-2zM32 2h1v1h-1zM36 2h2v1h-2zM39 2h1v1h-1zM43 2h1v1h-1zM46 2h1v1h-1zM48 2h3v1h-3zM52 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h1v1h-1zM12 3h1v1h-1zM15 3h2v1h-2zM20 3h1v1h-1zM23 3h2v1h-2zM27 3h1v1h-1zM30 3h1v1h-1zM33 3h3v1h-3zM42 3h1v1h-1zM44 3h1v1h-1zM46 3h1v1h-1zM48 3h3v1h-3zM52 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h1v1h-1zM10 4h2v1h-2zM13 4h1v1h-1zM16 4h2v1h-2zM19 4h12v1h-12zM32 4h2v1h-2zM37 4h1v1h-1zM40 4h3v1h-3zM46 4h1v1h-1zM48 4h3v1h-3zM52 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h2v1h-2zM11 5h2v1h-2zM24 5h1v1h-1zM28 5h1v1h-1zM33 5h3v1h-3zM39 5h1v1h-1zM41 5h2v1h-2zM46 5h1v1h-1zM52 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM24 6h1v1h-1zM26 6h1v1h-1zM28 6h1v1h-1zM30 6h1v1h-1zM32 6h1v1h-1zM34 6h1v1h-1zM36 6h1v1h-1zM38 6h1v1h-1zM40 6h1v1h-1zM42 6h1v1h-1zM44 6h1v1h-1zM46 6h7v1h-7zM8 7h1v1h-1zM13 7h2v1h-2zM16 7h2v1h-2zM23 7h2v1h-2zM28 7h1v1h-1zM30 7h2v1h-2zM33 7h4v1h-4zM40 7h3v1h-3zM44 7h1v1h-1zM0 8h1v1h-1zM2 8h5v1h-5zM11 8h4v1h-4zM18 8h1v1h-1zM21 8h1v1h-1zM24 8h7v1h-7zM35 8h2v1h-2zM39 8h1v1h-1zM41 8h4v1h-4zM46 8h5v1h-5zM3 9h1v1h-1zM8 9h2v1h-2zM12 9h5v1h-5zM19 9h2v1h-2zM22 9h1v1h-1zM24 9h1v1h-1zM27 9h2v1h-2zM30 9h2v1h-2zM33 9h1v1h-1zM35 9h2v1h-2zM39 9h1v1h-1zM42 9h1v1h-1zM45 9h1v1h-1zM48 9h2v1h-2zM52 9h1v1h-1zM3 10h1v1h-1zM6 10h6v1h-6zM18 10h1v1h-1zM20 10h1v1h-1zM29 10h1v1h-1zM34 10h1v1h-1zM36 10h1v1h-1zM38 10h4v1h-4zM43 10h1v1h-1zM46 10h1v1h-1zM48 10h1v1h-1zM50 10h2v1h-2zM0 11h3v1h-3zM4 11h1v1h-1zM7 11h2v1h-2zM10 11h2v1h-2zM15 11h2v1h-2zM19 11h1v1h-1zM21 11h1v1h-1zM23 11h2v1h-2zM29 11h1v1h-1zM31 11h2v1h-2zM35 11h1v1h-1zM40 11h1v1h-1zM42 11h3v1h-3zM46 11h2v1h-2zM49 11h1v1h-1zM51 11h1v1h-1zM0 12h1v1h-1zM2 12h1v1h-1zM6 12h1v1h-1zM8 12h2v1h-2zM11 12h1v1h-1zM15 12h4v1h-4zM23 12h4v1h-4zM28 12h1v1h-1zM36 12h1v1h-1zM39 12h1v1h-1zM41 12h4v1h-4zM48 12h1v1h-1zM50 12h2v1h-2zM0 13h2v1h-2zM4 13h2v1h-2zM9 13h1v1h-1zM11 13h1v1h-1zM15 13h1v1h-1zM20 13h3v1h-3zM24 13h2v1h-2zM27 13h3v1h-3zM32 13h1v1h-1zM35 13h2v1h-2zM39 13h1v1h-1zM42 13h1v1h-1zM45 13h1v1h-1zM47 13h1v1h-1zM51 13h2v1h-2zM0 14h4v1h-4zM5 14h2v1h-2zM9 14h1v1h-1zM12 14h1v1h-1zM16 14h1v1h-1zM18 14h1v1h-1zM20 14h1v1h-1zM23 14h1v1h-1zM25 14h1v1h-1zM30 14h1v1h-1zM33 14h1v1h-1zM35 14h4v1h-4zM43 14h2v1h-2zM46 14h1v1h-1zM48 14h1v1h-1zM0 15h1v1h-1zM2 15h1v1h-1zM4 15h2v1h-2zM8 15h1v1h-1zM10 15h2v1h-2zM13 15h1v1h-1zM15 15h2v1h-2zM18 15h1v1h-1zM20 15h1v1h-1zM22 15h1v1h-1zM24 15h2v1h-2zM28 15h2v1h-2zM31 15h3v1h-3zM35 15h1v1h-1zM40 15h1v1h-1zM4 16h1v1h-1zM6 16h1v1h-1zM8 16h1v1h-1zM10 16h1v1h-1zM12 16h3v1h-3zM16 16h1v1h-1zM18 16h3v1h-3zM23 16h2v1h-2zM26 16h1v1h-1zM31 16h1v1h-1zM36 16h2v1h-2zM39 16h1v1h-1zM41 16h2v1h-2zM44 16h1v1h-1zM47 16h4v1h-4zM2 17h1v1h-1zM4 17h2v1h-2zM7 17h1v1h-1zM9 17h1v1h-1zM12 17h1v1h-1zM14 17h1v1h-1zM16 17h1v1h-1zM21 17h1v1h-1zM23 17h2v1h-2zM28 17h3v1h-3zM33 17h1v1h-1zM35 17h3v1h-3zM42 17h2v1h-2zM45 17h1v1h-1zM47 17h1v1h-1zM49 17h1v1h-1zM51 17h2v1h-2zM0 18h1v1h-1zM2 18h2v1h-2zM6 18h3v1h-3zM10 18h1v1h-1zM15 18h2v1h-2zM19 18h3v1h-3zM23 18h1v1h-1zM25 18h1v1h-1zM27 18h1v1h-1zM29 18h4v1h-4zM39 18h1v1h-1zM41 18h1v1h-1zM43 18h1v1h-1zM46 18h2v1h-2zM49 18h1v1h-1zM0 19h2v1h-2zM7 19h3v1h-3zM14 19h2v1h-2zM17 19h1v1h-1zM24 19h2v1h-2zM27 19h1v1h-1zM30 19h1v1h-1zM32 19h1v1h-1zM36 19h4v1h-4zM41 19h2v1h-2zM44 19h1v1h-1zM46 19h2v1h-2zM51 19h1v1h-1zM0 20h7v1h-7zM8 20h2v1h-2zM15 20h7v1h-7zM26 20h6v1h-6zM33 20h4v1h-4zM38 20h1v1h-1zM40 20h1v1h-1zM43 20h4v1h-4zM48 20h1v1h-1zM50 20h1v1h-1zM11 21h1v1h-1zM15 21h1v1h-1zM17 21h4v1h-4zM23 21h2v1h-2zM29 21h2v1h-2zM33 21h1v1h-1zM35 21h1v1h-1zM37 21h4v1h-4zM42 21h1v1h-1zM48 21h1v1h-1zM50 21h1v1h-1zM52 21h1v1h-1zM1 22h1v1h-1zM6 22h1v1h-1zM8 22h1v1h-1zM13 22h3v1h-3zM23 22h2v1h-2zM27 22h1v1h-1zM32 22h5v1h-5zM40 22h2v1h-2zM44 22h3v1h-3zM48 22h1v1h-1zM50 22h2v1h-2zM0 23h4v1h-4zM5 23h1v1h-1zM7 23h1v1h-1zM13 23h1v1h-1zM17 23h3v1h-3zM21 23h1v1h-1zM24 23h2v1h-2zM29 23h1v1h-1zM34 23h3v1h-3zM41 23h3v1h-3zM45 23h1v1h-1zM51 23h1v1h-1zM3 24h7v1h-7zM11 24h2v1h-2zM16 24h2v1h-2zM19 24h3v1h-3zM23 24h7v1h-7zM31 24h1v1h-1zM36 24h1v1h-1zM38 24h1v1h-1zM41 24h1v1h-1zM43 24h8v1h-8zM2 25h3v1h-3zM8 25h2v1h-2zM11 25h1v1h-1zM13 25h1v1h-1zM15 25h2v1h-2zM18 25h3v1h-3zM22 25h1v1h-1zM24 25h1v1h-1zM28 25h6v1h-6zM35 25h3v1h-3zM42 25h3v1h-3zM48 25h1v1h-1zM52 25h1v1h-1zM1 26h2v1h-2zM4 26h1v1h-1zM6 26h1v1h-1zM8 26h2v1h-2zM11 26h5v1h-5zM17 26h5v1h-5zM24 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM34 26h1v1h-1zM36 26h2v1h-2zM39 26h3v1h-3zM44 26h1v1h-1zM46 26h1v1h-1zM48 26h1v1h-1zM51 26h1v1h-1zM2 27h1v1h-1zM4 27h1v1h-1zM8 27h2v1h-2zM11 27h1v1h-1zM13 27h1v1h-1zM15 27h5v1h-5zM21 27h2v1h-2zM24 27h1v1h-1zM28 27h3v1h-3zM33 27h1v1h-1zM36 27h3v1h-3zM40 27h1v1h-1zM44 27h1v1h-1zM48 27h1v1h-1zM52 27h1v1h-1zM0 28h9v1h-9zM10 28h1v1h-1zM12 28h2v1h-2zM15 28h7v1h-7zM23 28h6v1h-6zM30 28h8v1h-8zM39 28h1v1h-1zM42 28h1v1h-1zM44 28h8v1h-8zM0 29h1v1h-1zM2 29h2v1h-2zM5 29h1v1h-1zM15 29h2v1h-2zM18 29h1v1h-1zM20 29h1v1h-1zM22 29h6v1h-6zM30 29h1v1h-1zM32 29h2v1h-2zM36 29h2v1h-2zM42 29h1v1h-1zM44 29h2v1h-2zM48 29h2v1h-2zM52 29h1v1h-1zM3 30h4v1h-4zM8 30h1v1h-1zM11 30h2v1h-2zM17 30h1v1h-1zM22 30h1v1h-1zM24 30h1v1h-1zM28 30h2v1h-2zM31 30h2v1h-2zM34 30h1v1h-1zM36 30h1v1h-1zM38 30h1v1h-1zM41 30h1v1h-1zM45 30h1v1h-1zM48 30h1v1h-1zM51 30h1v1h-1zM1 31h3v1h-3zM5 31h1v1h-1zM8 31h1v1h-1zM10 31h2v1h-2zM13 31h1v1h-1zM15 31h1v1h-1zM19 31h2v1h-2zM22 31h1v1h-1zM25 31h1v1h-1zM27 31h1v1h-1zM30 31h3v1h-3zM34 31h2v1h-2zM40 31h2v1h-2zM43 31h2v1h-2zM46 31h3v1h-3zM52 31h1v1h-1zM1 32h1v1h-1zM3 32h2v1h-2zM6 32h1v1h-1zM8 32h1v1h-1zM10 32h2v1h-2zM13 32h1v1h-1zM16 32h1v1h-1zM19 32h3v1h-3zM24 32h1v1h-1zM29 32h2v1h-2zM33 32h1v1h-1zM36 32h1v1h-1zM38 32h2v1h-2zM41 32h2v1h-2zM44 32h2v1h-2zM47 32h1v1h-1zM49 32h4v1h-4zM1 33h1v1h-1zM5 33h1v1h-1zM7 33h3v1h-3zM12 33h7v1h-7zM20 33h4v1h-4zM25 33h1v1h-1zM30 33h1v1h-1zM32 33h1v1h-1zM37 33h1v1h-1zM39 33h1v1h-1zM42 33h1v1h-1zM48 33h1v1h-1zM52 33h1v1h-1zM4 34h1v1h-1zM6 34h2v1h-2zM9 34h1v1h-1zM13 34h1v1h-1zM15 34h1v1h-1zM17 34h2v1h-2zM24 34h1v1h-1zM27 34h1v1h-1zM29 34h3v1h-3zM33 34h1v1h-1zM36 34h1v1h-1zM41 34h1v1h-1zM43 34h3v1h-3zM51 34h1v1h-1zM1 35h1v1h-1zM3 35h1v1h-1zM8 35h2v1h-2zM14 35h3v1h-3zM21 35h1v1h-1zM24 35h2v1h-2zM30 35h1v1h-1zM32 35h1v1h-1zM34 35h2v1h-2zM37 35h2v1h-2zM40 35h1v1h-1zM43 35h1v1h-1zM46 35h1v1h-1zM48 35h1v1h-1zM51 35h1v1h-1zM0 36h1v1h-1zM2 36h2v1h-2zM5 36h2v1h-2zM9 36h5v1h-5zM15 36h2v1h-2zM18 36h1v1h-1zM21 36h1v1h-1zM23 36h2v1h-2zM27 36h1v1h-1zM30 36h2v1h-2zM33 36h2v1h-2zM36 36h4v1h-4zM42 36h1v1h-1zM47 36h1v1h-1zM49 36h3v1h-3zM2 37h1v1h-1zM4 37h2v1h-2zM7 37h1v1h-1zM9 37h11v1h-11zM22 37h2v1h-2zM25 37h3v1h-3zM29 37h3v1h-3zM34 37h1v1h-1zM36 37h1v1h-1zM39 37h1v1h-1zM42 37h1v1h-1zM48 37h1v1h-1zM51 37h2v1h-2zM0 38h7v1h-7zM11 38h2v1h-2zM14 38h2v1h-2zM17 38h3v1h-3zM22 38h1v1h-1zM28 38h1v1h-1zM30 38h2v1h-2zM33 38h1v1h-1zM38 38h2v1h-2zM41 38h1v1h-1zM44 38h2v1h-2zM2 39h1v1h-1zM10 39h1v1h-1zM13 39h1v1h-1zM15 39h1v1h-1zM17 39h3v1h-3zM21 39h2v1h-2zM24 39h4v1h-4zM29 39h4v1h-4zM34 39h1v1h-1zM36 39h1v1h-1zM39 39h1v1h-1zM42 39h2v1h-2zM46 39h4v1h-4zM51 39h1v1h-1zM0 40h3v1h-3zM6 40h2v1h-2zM9 40h1v1h-1zM12 40h1v1h-1zM14 40h3v1h-3zM18 40h1v1h-1zM20 40h1v1h-1zM22 40h2v1h-2zM27 40h1v1h-1zM29 40h2v1h-2zM33 40h5v1h-5zM39 40h1v1h-1zM42 40h1v1h-1zM44 40h2v1h-2zM51 40h1v1h-1zM1 41h3v1h-3zM7 41h2v1h-2zM10 41h1v1h-1zM14 41h2v1h-2zM17 41h3v1h-3zM21 41h1v1h-1zM23 41h5v1h-5zM30 41h1v1h-1zM32 41h1v1h-1zM39 41h1v1h-1zM42 41h1v1h-1zM46 41h4v1h-4zM52 41h1v1h-1zM0 42h2v1h-2zM3 42h4v1h-4zM10 42h3v1h-3zM15 42h1v1h-1zM18 42h1v1h-1zM20 42h1v1h-1zM29 42h1v1h-1zM33 42h1v1h-1zM35 42h1v1h-1zM37 42h1v1h-1zM39 42h1v1h-1zM41 42h1v1h-1zM43 42h3v1h-3zM49 42h3v1h-3zM1 43h2v1h-2zM11 43h1v1h-1zM13 43h3v1h-3zM18 43h9v1h-9zM29 43h1v1h-1zM36 43h1v1h-1zM40 43h1v1h-1zM42 43h2v1h-2zM46 43h1v1h-1zM48 43h1v1h-1zM51 43h1v1h-1zM3 44h1v1h-1zM6 44h2v1h-2zM10 44h3v1h-3zM15 44h1v1h-1zM17 44h1v1h-1zM19 44h2v1h-2zM24 44h5v1h-5zM31 44h1v1h-1zM33 44h3v1h-3zM38 44h2v1h-2zM42 44h1v1h-1zM44 44h8v1h-8zM8 45h2v1h-2zM15 45h1v1h-1zM18 45h1v1h-1zM20 45h1v1h-1zM24 45h1v1h-1zM28 45h1v1h-1zM30 45h1v1h-1zM32 45h1v1h-1zM39 45h1v1h-1zM42 45h1v1h-1zM44 45h1v1h-1zM48 45h1v1h-1zM51 45h2v1h-2zM0 46h7v1h-7zM9 46h1v1h-1zM11 46h1v1h-1zM13 46h1v1h-1zM18 46h2v1h-2zM21 46h1v1h-1zM24 46h1v1h-1zM26 46h1v1h-1zM28 46h1v1h-1zM33 46h3v1h-3zM38 46h2v1h-2zM42 46h3v1h-3zM46 46h1v1h-1zM48 46h1v1h-1zM0 47h1v1h-1zM6 47h1v1h-1zM8 47h1v1h-1zM14 47h2v1h-2zM17 47h1v1h-1zM19 47h1v1h-1zM23 47h2v1h-2zM28 47h1v1h-1zM30 47h2v1h-2zM33 47h1v1h-1zM35 47h2v1h-2zM40 47h1v1h-1zM42 47h1v1h-1zM44 47h1v1h-1zM48 47h1v1h-1zM52 47h1v1h-1zM0 48h1v1h-1zM2 48h3v1h-3zM6 48h1v1h-1zM8 48h8v1h-8zM21 48h1v1h-1zM23 48h6v1h-6zM30 48h1v1h-1zM34 48h3v1h-3zM38 48h2v1h-2zM42 48h1v1h-1zM44 48h7v1h-7zM0 49h1v1h-1zM2 49h3v1h-3zM6 49h1v1h-1zM8 49h3v1h-3zM13 49h2v1h-2zM16 49h1v1h-1zM25 49h1v1h-1zM30 49h2v1h-2zM36 49h1v1h-1zM39 49h2v1h-2zM42 49h1v1h-1zM47 49h1v1h-1zM0 50h1v1h-1zM2 50h3v1h-3zM6 50h1v1h-1zM8 50h4v1h-4zM13 50h3v1h-3zM19 50h3v1h-3zM23 50h1v1h-1zM26 50h4v1h-4zM33 50h1v1h-1zM36 50h3v1h-3zM41 50h1v1h-1zM43 50h1v1h-1zM45 50h2v1h-2zM48 50h1v1h-1zM51 50h2v1h-2zM0 51h1v1h-1zM6 51h1v1h-1zM12 51h2v1h-2zM15 51h2v1h-2zM18 51h1v1h-1zM21 51h3v1h-3zM25 51h1v1h-1zM27 51h1v1h-1zM29 51h1v1h-1zM31 51h2v1h-2zM34 51h3v1h-3zM39 51h4v1h-4zM48 51h2v1h-2zM51 51h1v1h-1zM0 52h7v1h-7zM8 52h3v1h-3zM12 52h2v1h-2zM17 52h1v1h-1zM19 52h1v1h-1zM21 52h2v1h-2zM24 52h1v1h-1zM26 52h1v1h-1zM28 52h1v1h-1zM34 52h3v1h-3zM38 52h1v1h-1zM42 52h2v1h-2zM45 52h2v1h-2zM48 52h1v1h-1zM50 52h1v1h-1z"


# Prompt para a Claude API (Stage 3 automático)
SYSTEM_PROMPT = """You generate image prompts for a hand-drawn doodle animation YouTube channel.
STYLE — apply identically to EVERY prompt:
• Opening:  "Hand-drawn 2D doodle cartoon animation, flat colors, bold black outlines, slightly imperfect sketchy marker lines,"
• Closing:  "no gradients, no shadows, no textures, no photorealism, no 3D, 16:9 aspect ratio, educational YouTube explainer doodle style."
• Characters: simple stick figures, large circular heads, dot eyes, thick expressive brow lines
• Backgrounds: flat solid color only — white default, green+blue outdoor, orange fire/ancient, dark blue night, tan cave
• On-screen text: bold ALL CAPS marker font, RED/BLACK/YELLOW, top of frame
RULES: one prompt per timestamp, never skip, format [MM:SS] ..., concrete visible scenes, hold scene across consecutive identical moments, one blank line between prompts, chronological order."""


# ═════════════════════════════════════════════════════════════════
# Estado global (single-user, app local)
# ═════════════════════════════════════════════════════════════════
STATE = {
    "audio_path": "",
    "segments": [],        # [(start_seconds, text)]
    "images_folder": "",
    "output_path": "",
    "capcut_draft": "",
    "busy": False,
    "log": "",
}


# ─────────────────────────────────────────────────────────────────
# Seletor de arquivo/pasta nativo (subprocess isolado p/ não travar)
# ─────────────────────────────────────────────────────────────────
def _native_dialog(kind: str) -> str:
    """kind = 'openfile' | 'folder'."""
    if os.name != 'nt':
        import subprocess
        try:
            if kind == "openfile":
                cmd = ['osascript', '-e', 'try', '-e', 'POSIX path of (choose file with prompt "Selecionar áudio")', '-e', 'end try']
            else:
                cmd = ['osascript', '-e', 'try', '-e', 'POSIX path of (choose folder with prompt "Pasta com as imagens do LCTNET FLOW")', '-e', 'end try']
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            return out.stdout.strip()
        except Exception:
            return ""

    code = (
        "import tkinter as tk; from tkinter import filedialog as fd;"
        "r=tk.Tk(); r.withdraw(); r.update();"
        "r.attributes('-topmost', True); r.lift(); r.focus_force();"
    )
    if kind == "openfile":
        code += ("p=fd.askopenfilename(parent=r, title='Selecionar áudio',"
                 "filetypes=[('Áudio','*.mp3 *.wav *.m4a *.ogg *.flac'),('Todos','*.*')]);")
    else:
        code += "p=fd.askdirectory(parent=r, title='Pasta com as imagens do LCTNET FLOW');"
    code += "print(p if p else '')"
    try:
        out = subprocess.run([sys.executable, "-c", code],
                             capture_output=True, text=True, timeout=300)
        return out.stdout.strip()
    except Exception:
        return ""


# ─────────────────────────────────────────────────────────────────
# Lógica — transcrição, prompts, montagem
# ─────────────────────────────────────────────────────────────────
def srt_lines():
    return [f"[{int(t)//60:02d}:{int(t)%60:02d}] {txt}" for t, txt in STATE["segments"]]


def full_paste_text():
    return PASTE_INSTRUCTIONS + "\n".join(srt_lines())


def do_transcribe():
    """Chama a venv whisperx via subprocess, lê o JSON e popula STATE['segments']."""
    if not WHISPER_PY.exists():
        return {"ok": False, "error": "venv whisperx não encontrada em whisperx_env\\Scripts\\python.exe"}

    out_json = Path(tempfile.gettempdir()) / "lctnet_vm_transcript.json"
    try:
        proc = subprocess.run(
            [str(WHISPER_PY), str(WHISPER_SCRIPT), STATE["audio_path"],
             str(out_json), WHISPER_MODEL, WHISPER_LANG],
            capture_output=True, text=True, cwd=str(BASE_DIR)
        )
        
        # Mesmo se der erro no encerramento (warnings, semaphores), se o JSON existir e for válido, aceitamos.
        if not out_json.exists() or out_json.stat().st_size == 0:
            return {"ok": False, "error": (proc.stderr or proc.stdout)[-600:]}

        try:
            data = json.loads(out_json.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"ok": False, "error": (proc.stderr or proc.stdout)[-600:]}
        STATE["segments"] = [(float(s["start"]), s["text"].strip())
                             for s in data if s.get("text", "").strip()]
        return {"ok": True, "count": len(STATE["segments"]),
                "srt": "\n".join(srt_lines()),
                "paste": full_paste_text()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def do_gen_api(api_key: str):
    """Stage 3 automático via Claude API (opcional, pago)."""
    try:
        import anthropic
    except ImportError:
        return {"ok": False, "error": "SDK não instalado. Rode: pip install anthropic"}
    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-opus-4-8", max_tokens=8096, system=SYSTEM_PROMPT,
            messages=[{"role": "user",
                       "content": "Generate one image prompt per timestamp:\n\n" + "\n".join(srt_lines())}]
        )
        return {"ok": True, "prompts": msg.content[0].text}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def scan_images(folder: str):
    """(timestamp_seg, caminho) ordenado. Lê o [MM-SS] do nome do arquivo.

    O Google Flow às vezes gera VÁRIAS imagens por prompt (sufixos _1, _2…).
    São variações da MESMA cena — mantemos só a primeira de cada cena para
    não criar micro-segmentos. Cenas realmente distintas no mesmo segundo
    (nomes-base diferentes) são preservadas e o gerador divide o tempo.
    """
    pat = re.compile(r'\[(\d{1,2})-(\d{2})\]')
    suf = re.compile(r'_(\d+)(\.[^.]+)$')  # sufixo de variação _N antes da extensão
    grupos = {}  # (ts, nome_base) -> (ts, caminho, num_variacao)
    for f in sorted(os.listdir(folder)):
        if not f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        m = pat.search(f)
        if not m:
            continue
        ts = int(m.group(1)) * 60 + int(m.group(2))
        base = suf.sub(r"\2", f)              # remove o _N → nome-base da cena
        sm = suf.search(f)
        num = int(sm.group(1)) if sm else 0
        key = (ts, base)
        if key not in grupos or num < grupos[key][2]:
            grupos[key] = (ts, os.path.join(folder, f), num)
    res = [(ts, path) for (ts, path, _) in grupos.values()]
    res.sort(key=lambda x: (x[0], os.path.basename(x[1])))
    return res


def _capcut_drafts_dir(cfg: dict) -> str:
    """
    Acha a pasta de projetos do CapCut do usuário ATUAL (portátil entre máquinas).
    Ordem: caminho do config.json (se existir) → locais padrão do CapCut/JianyingPro.
    Retorna "" se nada for encontrado.
    """
    # 1) o que estiver no config.json, se realmente existir nesta máquina
    cfg_path = (cfg.get("capcut") or {}).get("pasta_drafts", "")
    if cfg_path and os.path.isdir(cfg_path):
        return cfg_path

    # 2) locais padrão por usuário
    local = os.environ.get("LOCALAPPDATA", "")
    appdata = os.environ.get("APPDATA", "")
    candidatos = []
    
    if os.name != 'nt':
        home = os.path.expanduser("~")
        candidatos += [
            os.path.join(home, "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft"),
            os.path.join(home, "Movies", "JianyingPro", "User Data", "Projects", "com.lveditor.draft")
        ]
    else:
        for raiz in (local, appdata):
            if not raiz:
                continue
            candidatos += [
                os.path.join(raiz, "CapCut", "User Data", "Projects", "com.lveditor.draft"),
                os.path.join(raiz, "JianyingPro", "User Data", "Projects", "com.lveditor.draft"),
            ]
            
    for c in candidatos:
        if os.path.isdir(c):
            return c
    return ""


def do_assemble():
    """Monta um draft do CapCut cena-por-cena (imagens + áudio), editável."""
    images = scan_images(STATE["images_folder"])
    if not images:
        return {"ok": False, "error": "Nenhuma imagem com timestamp [MM-SS] na pasta."}
    if not STATE["audio_path"]:
        return {"ok": False, "error": "Áudio não selecionado."}

    try:
        import capcut_draft_imagens as gen
        cfg = _full_config()
        pasta_drafts = _capcut_drafts_dir(cfg)
        if not pasta_drafts:
            return {"ok": False, "error": (
                "Pasta de projetos do CapCut não encontrada. "
                "Abra o CapCut ao menos uma vez (ele cria a pasta) e tente de novo."
            )}

        dur = _audio_duration_any(STATE["audio_path"])
        if dur <= 0:
            return {"ok": False, "error": "Não consegui ler a duração do áudio."}

        vid = cfg.get("video", {})
        nome = f"LctnetVideo_{Path(STATE['audio_path']).stem[:16]}"
        pasta = gen.criar_draft_imagens(
            imagens=images, audio_path=STATE["audio_path"], audio_dur_seg=dur,
            pasta_destino=pasta_drafts, nome_projeto=nome,
            largura=vid.get("largura", 1920), altura=vid.get("altura", 1080),
            fps=vid.get("fps", 30),
        )
        STATE["capcut_draft"] = pasta
        return {"ok": True, "scenes": len(images),
                "capcut": {"ok": True, "msg": f"Projeto cena-por-cena criado: {os.path.basename(pasta)}"},
                "path": pasta}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _audio_duration_any(path: str) -> float:
    """Duração do áudio via PyAV; fallback ffmpeg."""
    try:
        import av
        with av.open(path) as c:
            if c.duration:
                return float(c.duration) / 1_000_000
    except Exception:
        pass
    return _audio_duration(path, ffmpeg_exe())


def _audio_duration(path: str, ff: str) -> float:
    """Duração via ffmpeg (parse do stderr) — não dependemos do ffprobe."""
    proc = subprocess.run([ff, "-i", path], capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", proc.stderr)
    if m:
        h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return h * 3600 + mi * 60 + s
    # fallback: PyAV
    try:
        import av
        with av.open(path) as c:
            return float(c.duration) / 1_000_000
    except Exception:
        return 0.0


# ═════════════════════════════════════════════════════════════════
# HTML (UI com o visual + animações da extensão LCTNET FLOW)
# ═════════════════════════════════════════════════════════════════
def build_html() -> str:
    logo_b64 = ""
    if LOGO_PATH.exists():
        logo_b64 = base64.b64encode(LOGO_PATH.read_bytes()).decode()
    logo_src = f"data:image/png;base64,{logo_b64}" if logo_b64 else ""
    return HTML_TEMPLATE.replace("{{LOGO}}", logo_src).replace("{{PIX_PATH}}", PIX_QR_PATH)


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LCTNET VIDEO MAKER</title>
<style>
@property --glow-angle { syntax:'<angle>'; initial-value:0deg; inherits:false; }
@keyframes shimmer-bar { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes vibgyor-spin { 0%{--glow-angle:0deg} 100%{--glow-angle:360deg} }
@keyframes dot-breathe { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.75)} }
@keyframes fade-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
@keyframes spin { to { transform: rotate(360deg); } }
:root{
  --bg:#07070f; --bg-deep:#040408; --surface:#0f0f1a; --surface-el:#14141f;
  --text:#e2e2f0; --text-muted:rgba(200,200,230,.5); --border-strong:rgba(255,255,255,.10);
  --green:#00ff88; --cyan:#00bbff; --orange:#ff8800; --amber:#ffaa00; --accent:#ff2244;
  --radius:12px; --radius-sm:8px;
  --font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
*{box-sizing:border-box}
html{height:100%}
body{
  margin:0; min-height:100%; font:14px/1.5 var(--font); color:var(--text);
  background:var(--bg);
  background-image:radial-gradient(ellipse at 50% 0%, rgba(255,34,68,.10) 0%, transparent 60%),
                   linear-gradient(180deg, var(--bg-deep) 0%, var(--bg) 100%);
  display:flex; justify-content:center;
}
body::before{
  content:''; position:fixed; top:0; left:0; right:0; height:3px; z-index:1000;
  background:linear-gradient(90deg,var(--green),var(--cyan),var(--accent),var(--orange),var(--green));
  background-size:300% 100%; animation:shimmer-bar 3s linear infinite;
}
.app{ width:100%; max-width:640px; padding:26px 20px 50px; }
.hero{ display:flex; align-items:center; gap:14px; margin-bottom:8px; }
.hero img{ width:54px; height:54px; border-radius:50%; flex-shrink:0;
  border:2px solid var(--accent); filter:drop-shadow(0 0 10px rgba(255,34,68,.55)); }
.hero h1{ margin:0; font-size:24px; font-weight:800; letter-spacing:.04em;
  background:linear-gradient(135deg,#fff 0%,var(--orange) 50%,#ff2244 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
  filter:drop-shadow(0 0 8px rgba(255,34,68,.3)); }
.hero .sub{ font-size:10px; color:var(--text-muted); letter-spacing:.06em; margin-top:2px; }
.step{ background:var(--surface); border:1px solid var(--border-strong);
  border-radius:var(--radius); padding:16px 16px 18px; margin-top:14px; animation:fade-in .4s ease; }
.step.active{ border-color:rgba(255,34,68,.45); box-shadow:0 0 16px rgba(255,34,68,.12); }
.step.done{ border-color:rgba(0,255,136,.3); }
.step-h{ display:flex; align-items:center; gap:9px; margin-bottom:12px; }
.step-n{ width:24px; height:24px; border-radius:50%; flex-shrink:0;
  display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800;
  background:var(--surface-el); border:1.5px solid var(--accent); color:var(--accent); }
.step.done .step-n{ background:var(--green); border-color:var(--green); color:#04220f; }
.step-t{ font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--text); }
.row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.fname{ flex:1; min-width:0; font-size:12px; color:var(--text-muted);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.fname.set{ color:var(--text); }
.btn{ display:inline-flex; align-items:center; justify-content:center; gap:6px;
  padding:9px 15px; font:inherit; font-weight:700; font-size:12px; letter-spacing:.03em;
  border-radius:var(--radius-sm); border:1px solid var(--border-strong); cursor:pointer;
  background:var(--surface-el); color:var(--text); transition:all .15s ease; }
.btn:hover:not(:disabled){ transform:translateY(-1px); }
.btn:active:not(:disabled){ transform:scale(.97); }
.btn:disabled{ opacity:.35; cursor:not-allowed; }
.btn-accent{ background:linear-gradient(135deg,#ff2244,var(--orange)); color:#fff; border-color:transparent;
  box-shadow:0 0 16px rgba(255,34,68,.35); }
.btn-accent:hover:not(:disabled){ box-shadow:0 0 24px rgba(255,34,68,.55); }
.btn-green{ background:var(--green); color:#04220f; border-color:transparent; box-shadow:0 0 12px rgba(0,255,136,.3); }
.btn-orange{ background:rgba(255,136,0,.14); color:var(--orange); border-color:rgba(255,136,0,.4); }
.btn-ghost{ background:transparent; }
.btn-full{ width:100%; padding:13px; font-size:14px; }
.hint{ font-size:11px; color:#3a3a55; margin-top:9px; }
.note{ font-size:12px; margin-top:8px; }
.note.ok{ color:var(--green); } .note.warn{ color:var(--orange); } .note.err{ color:var(--accent); }
.srt{ width:100%; height:150px; margin-top:4px; resize:vertical; padding:10px 12px;
  font:11px/1.5 Consolas,monospace; color:var(--text); background:var(--surface-el);
  border:1px solid var(--border-strong); border-radius:var(--radius-sm); }
.path-input{ flex:1; min-width:0; padding:8px 11px; font:11px Consolas,monospace;
  color:var(--text); background:var(--surface-el); border:1px solid var(--border-strong);
  border-radius:var(--radius-sm); }
.path-input:focus{ outline:none; border-color:var(--accent); }
.path-input::placeholder{ color:#3a3a55; }
/* glow rotativo (VIBGYOR) — igual ao item ativo da extensão */
.glow{ position:relative; }
.glow.on::before{ content:''; position:absolute; inset:-2px; border-radius:calc(var(--radius)+2px);
  background:conic-gradient(from var(--glow-angle),#ff0000,#ff8800,#ffee00,#00ff44,#00bbff,#4455ff,#9900ff,#ff0000);
  animation:vibgyor-spin 1.8s linear infinite; z-index:0; }
.glow.on > *{ position:relative; z-index:2; }
.spinner{ width:15px; height:15px; border:2px solid rgba(255,255,255,.25);
  border-top-color:#fff; border-radius:50%; animation:spin .7s linear infinite; display:inline-block; }
.foot{ text-align:center; margin-top:24px; font-size:10px; color:#33334d; }
.foot a{ color:var(--accent); text-decoration:none; }
.disabled-step{ opacity:.45; pointer-events:none; }
dialog{ border:1px solid var(--border-strong); border-radius:var(--radius); background:var(--surface);
  color:var(--text); padding:22px; max-width:420px; box-shadow:0 0 40px rgba(255,34,68,.2); }
dialog::backdrop{ background:rgba(0,0,0,.7); }
dialog input{ width:100%; margin:10px 0; padding:9px 11px; background:var(--surface-el);
  border:1px solid var(--border-strong); border-radius:var(--radius-sm); color:var(--text);
  font:13px Consolas,monospace; }
/* Apoie o canal (Pix) */
.step.apoio{ border-color:rgba(0,255,136,.28); }
.step.apoio .step-n{ background:var(--surface-el); border-color:var(--green); color:var(--green); }
.pix{ display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
.pix-qr{ width:140px; height:140px; flex-shrink:0; background:#fff; border-radius:var(--radius-sm);
  padding:8px; box-shadow:0 0 18px rgba(0,255,136,.18); }
.pix-qr svg{ width:100%; height:100%; display:block; }
.pix-info{ flex:1; min-width:200px; }
.pix-name{ font-size:12px; font-weight:800; color:var(--green); letter-spacing:.03em; margin-bottom:6px; }
.pix-info p{ margin:0 0 12px; font-size:12px; color:var(--text-muted); line-height:1.6; }
</style></head>
<body><div class="app">
  <div class="hero">
    <img src="{{LOGO}}" alt="logo">
    <div>
      <h1>LCTNET VIDEO MAKER</h1>
      <div class="sub">ÁUDIO → TRANSCRIÇÃO → PROMPTS → IMAGENS → VÍDEO</div>
    </div>
  </div>

  <!-- PASSO 1 -->
  <div class="step active" id="s1">
    <div class="step-h"><div class="step-n">1</div><div class="step-t">Áudio</div></div>
    <div class="row">
      <span class="fname" id="audioName">Nenhum arquivo selecionado</span>
      <button class="btn" onclick="pickAudio()">Selecionar áudio</button>
    </div>
    <div class="glow" id="transcribeWrap" style="margin-top:12px">
      <button class="btn btn-accent btn-full" id="btnTranscribe" disabled onclick="transcribe()">
        ▶ Transcrever com WhisperX
      </button>
    </div>
    <div class="note" id="note1"></div>
  </div>

  <!-- PASSO 2 -->
  <div class="step disabled-step" id="s2">
    <div class="step-h"><div class="step-n">2</div><div class="step-t">Transcrição + Prompts</div></div>
    <textarea class="srt" id="srt" readonly placeholder="A transcrição aparece aqui…"></textarea>
    <div class="row" style="margin-top:8px">
      <button class="btn btn-green" id="btnCopy" onclick="copyPaste()">📋 Copiar Prompt + SRT</button>
      <button class="btn btn-ghost" onclick="downloadTxt()">↓ Salvar .txt</button>
      <button class="btn btn-ghost" style="color:var(--cyan);border-color:rgba(0,187,255,.3)" onclick="downloadSrt()">🎬 Salvar Legenda (.srt)</button>
    </div>
    <div class="hint">💡 Grátis: clique "Copiar Prompt + SRT", cole no Claude/ChatGPT, copie os prompts e gere as imagens no LCTNET FLOW.</div>
  </div>

  <!-- PASSO 3 -->
  <div class="step disabled-step" id="s3">
    <div class="step-h"><div class="step-n">3</div><div class="step-t">Imagens (do LCTNET FLOW)</div></div>
    <div class="row">
      <span class="fname" id="folderName">Nenhuma pasta selecionada</span>
      <button class="btn" onclick="pickFolder()">Selecionar pasta</button>
    </div>
    <div class="row" style="margin-top:10px">
      <input type="text" id="folderPath" class="path-input"
             placeholder="ou cole o caminho aqui, ex: C:\Users\Dell\Downloads\lctnet-img"
             spellcheck="false" />
      <button class="btn btn-ghost" onclick="setFolder()">Usar caminho</button>
    </div>
    <div class="note" id="note3"></div>
  </div>

  <!-- PASSO 4 -->
  <div class="step disabled-step" id="s4">
    <div class="step-h"><div class="step-n">4</div><div class="step-t">Montar vídeo + enviar ao CapCut</div></div>
    <div class="glow" id="assembleWrap">
      <button class="btn btn-accent btn-full" id="btnAssemble" disabled onclick="assemble()">
        🎬 Montar e Enviar ao CapCut
      </button>
    </div>
    <div class="note" id="note4"></div>
    <div class="note" id="note4b"></div>
    <button class="btn btn-ghost btn-full" id="btnOpen" style="display:none;margin-top:8px" onclick="openOut()">
      📁 Abrir pasta do projeto CapCut
    </button>
  </div>

  <!-- APOIE O CANAL (Pix) -->
  <div class="step apoio" id="apoio">
    <div class="step-h"><div class="step-n">♥</div><div class="step-t">Gostou? Apoie o canal</div></div>
    <div class="pix">
      <div class="pix-qr">
        <svg viewBox="-2 -2 57 57" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
          <rect x="-2" y="-2" width="57" height="57" fill="#ffffff"/>
          <path fill="#0b0b14" d="{{PIX_PATH}}"/>
        </svg>
      </div>
      <div class="pix-info">
        <div class="pix-name">Pix · lctnet.ia</div>
        <p>Esse programa é <b>100% grátis</b>. Se ele te ajudou, contribua com qualquer valor via Pix pra manter o canal e novas ferramentas no ar. 🙏</p>
        <button class="btn btn-green" id="btnPix" onclick="copyPix()">📋 Copiar chave Pix (copia e cola)</button>
      </div>
    </div>
  </div>

  <div class="foot">© 2025 lctnet.ia · <a href="https://www.youtube.com/@lctnetmachadoIA" target="_blank">@lctnet.ia</a> · Todos os direitos reservados</div>
</div>

<dialog id="apiDlg">
  <div style="font-weight:800;font-size:15px">Claude API — Gerar Prompts</div>
  <input type="password" id="apiKey" placeholder="sk-ant-..." autocomplete="off">
  <div style="font-size:11px;color:var(--text-muted)">Pague por uso · console.anthropic.com → API Keys</div>
  <div class="row" style="margin-top:14px;justify-content:flex-end">
    <button class="btn btn-ghost" onclick="apiDlg.close()">Cancelar</button>
    <button class="btn btn-accent" onclick="runApi()">✨ Gerar</button>
  </div>
</dialog>

<script>
let pasteText = "", srtText = "";
const $ = id => document.getElementById(id);
async function api(path, body){
  const r = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body||{})});
  return r.json();
}
function enableStep(id){ $(id).classList.remove('disabled-step'); $(id).classList.add('active'); }
function doneStep(id){ $(id).classList.remove('active'); $(id).classList.add('done'); }

async function pickAudio(){
  const r = await api('/api/pick_audio');
  if(r.path){ $('audioName').textContent = r.name; $('audioName').classList.add('set');
    $('btnTranscribe').disabled = false; }
}
async function transcribe(){
  const wrap = $('transcribeWrap'), btn = $('btnTranscribe');
  wrap.classList.add('on'); btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Transcrevendo… (pode levar alguns minutos)';
  $('note1').textContent = '';
  const r = await api('/api/transcribe');
  wrap.classList.remove('on');
  btn.innerHTML = '▶ Transcrever com WhisperX'; btn.disabled = false;
  if(r.ok){
    pasteText = r.paste; srtText = r.srt; $('srt').value = r.srt;
    $('note1').className='note ok'; $('note1').textContent = `✓ ${r.count} segmentos transcritos`;
    // Passos 2 e 3 ficam disponíveis juntos: o usuário copia os prompts (passo 2),
    // gera as imagens fora do programa, e volta para selecionar a pasta (passo 3).
    // O passo 3 NÃO depende de concluir o passo 2.
    doneStep('s1'); enableStep('s2'); enableStep('s3');
  } else {
    $('note1').className='note err'; $('note1').textContent = '✗ ' + r.error;
  }
}
async function copyPaste(){
  await navigator.clipboard.writeText(pasteText);
  const b = $('btnCopy'); const old = b.textContent;
  b.textContent = '✓ Copiado! Cole no Claude'; setTimeout(()=>b.textContent=old, 2500);
}
function downloadTxt(){
  const blob = new Blob([pasteText], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'prompt_e_transcricao.txt'; a.click();
}
function fmtSrtTime(s){
  let h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=Math.floor(s%60), ms=Math.floor((s%1)*1000);
  return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0')+','+String(ms).padStart(3,'0');
}
function downloadSrt(){
  let lines = $('srt').value.split('\n');
  let segs = [];
  let pat = /\[(\d{1,2}):(\d{2})\]\s*(.*)/;
  lines.forEach(l=>{
    let m = pat.exec(l);
    if(m){
      let ts = parseInt(m[1])*60 + parseInt(m[2]);
      if(m[3].trim()) segs.push({start: ts, text: m[3].trim()});
    }
  });
  if(!segs.length) return;
  let out = segs.map((s, i)=>{
    let start = fmtSrtTime(s.start);
    let next = (i < segs.length - 1) ? segs[i+1].start : s.start + 4;
    if(next <= s.start) next = s.start + 3;
    let end = fmtSrtTime(next);
    return (i+1)+'\n'+start+' --> '+end+'\n'+s.text+'\n';
  }).join('\n');
  let blob = new Blob([out], {type:'text/plain;charset=utf-8'});
  let a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'legenda_capcut.srt'; a.click();
}
const apiDlg = $('apiDlg');
function openApi(){ apiDlg.showModal(); }
async function runApi(){
  const key = $('apiKey').value.trim(); if(!key) return;
  apiDlg.close();
  const r = await api('/api/gen_api', {key});
  if(r.ok){
    const blob = new Blob([r.prompts], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'image_prompts.txt'; a.click();
  } else { alert('Erro: ' + r.error); }
}
function applyFolderResult(r){
  if(r && r.path){
    $('folderName').textContent = r.path; $('folderName').classList.add('set');
    $('folderPath').value = r.path;
    if(r.count>0){ $('note3').className='note ok'; $('note3').textContent = `✓ ${r.count} imagens com timestamp encontradas`;
      doneStep('s2'); doneStep('s3'); enableStep('s4'); $('btnAssemble').disabled = false; }
    else { $('note3').className='note warn'; $('note3').textContent = '⚠ Nenhuma imagem com timestamp [MM-SS] nessa pasta'; }
  } else if(r && r.error){
    $('note3').className='note err'; $('note3').textContent = '✗ ' + r.error;
  }
}
async function pickFolder(){
  applyFolderResult(await api('/api/pick_folder'));
}
async function setFolder(){
  const p = $('folderPath').value.trim();
  if(!p) return;
  applyFolderResult(await api('/api/set_folder', {path:p}));
}
async function assemble(){
  const wrap = $('assembleWrap'), btn = $('btnAssemble');
  wrap.classList.add('on'); btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Montando e exportando…';
  $('note4').textContent='';
  const r = await api('/api/assemble');
  wrap.classList.remove('on');
  btn.innerHTML = '🎬 Montar e Enviar ao CapCut';
  if(r.ok){
    $('note4').className='note ok'; $('note4').textContent = `✓ ${r.scenes} cenas montadas na timeline + áudio sincronizado`;
    if(r.capcut && r.capcut.ok){
      $('note4b').className='note ok'; $('note4b').textContent = '✓ ' + r.capcut.msg + ' — abra o CapCut e o projeto estará lá, cena por cena.';
    }
    doneStep('s4'); $('btnOpen').style.display='block';
  } else {
    $('note4').className='note err'; $('note4').textContent = '✗ ' + r.error; btn.disabled = false;
  }
}
function openOut(){ api('/api/open_out'); }
const PIX_CODE = "00020126580014BR.GOV.BCB.PIX01360d7c6d0d-599a-4d40-b896-6b8e1e07ec9e5204000053039865802BR5923Lctnet Machado de Bonfim6009SAO PAULO62140510v41WD6P5j76304D870";
async function copyPix(){
  try { await navigator.clipboard.writeText(PIX_CODE); }
  catch(e){ const t=document.createElement('textarea'); t.value=PIX_CODE; document.body.appendChild(t);
    t.select(); document.execCommand('copy'); t.remove(); }
  const b = $('btnPix'); const old = b.textContent;
  b.textContent = '✓ Chave Pix copiada! Cole no app do banco'; setTimeout(()=>b.textContent=old, 3000);
}
</script>
</body></html>"""


# ═════════════════════════════════════════════════════════════════
# Servidor HTTP
# ═════════════════════════════════════════════════════════════════
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # silencia o log no console
        pass

    def _send(self, code, body, ctype="application/json"):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if urlparse(self.path).path in ("/", "/index.html"):
            self._send(200, build_html(), "text/html; charset=utf-8")
        else:
            self._send(404, "{}")

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except Exception:
            body = {}

        if STATE["busy"] and path in ("/api/transcribe", "/api/assemble", "/api/gen_api"):
            self._send(200, json.dumps({"ok": False, "error": "Já existe uma tarefa em andamento."}))
            return

        try:
            result = self._route(path, body)
        except Exception as e:
            result = {"ok": False, "error": str(e)}
        self._send(200, json.dumps(result, ensure_ascii=False))

    def _route(self, path, body):
        if path == "/api/pick_audio":
            p = _native_dialog("openfile")
            if p:
                STATE["audio_path"] = p
                return {"path": p, "name": os.path.basename(p)}
            return {"path": ""}

        if path == "/api/transcribe":
            STATE["busy"] = True
            try:
                return do_transcribe()
            finally:
                STATE["busy"] = False

        if path == "/api/gen_api":
            STATE["busy"] = True
            try:
                return do_gen_api(body.get("key", ""))
            finally:
                STATE["busy"] = False

        if path == "/api/pick_folder":
            p = _native_dialog("folder")
            if p:
                STATE["images_folder"] = p
                return {"path": p, "count": len(scan_images(p))}
            return {"path": ""}

        if path == "/api/set_folder":
            p = (body.get("path") or "").strip().strip('"')
            if not p or not os.path.isdir(p):
                return {"path": "", "error": "Pasta não encontrada. Confira o caminho."}
            STATE["images_folder"] = p
            return {"path": p, "count": len(scan_images(p))}

        if path == "/api/assemble":
            STATE["busy"] = True
            try:
                return do_assemble()
            finally:
                STATE["busy"] = False

        if path == "/api/open_out":
            alvo = STATE.get("capcut_draft") or STATE.get("output_path")
            if alvo and os.path.exists(alvo):
                dir_alvo = alvo if os.path.isdir(alvo) else os.path.dirname(alvo)
                if hasattr(os, 'startfile'):
                    os.startfile(dir_alvo)
                else:
                    subprocess.call(["open", dir_alvo])
            return {"ok": True}

        return {"ok": False, "error": "rota desconhecida"}


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print("=" * 46)
    print("            LCTNET VIDEO MAKER")
    print("=" * 46)
    print(f"\n  Aberto em: {url}")
    print(f"  Modelo WhisperX: {WHISPER_MODEL} · idioma: {WHISPER_LANG}")
    print("  Feche esta janela para encerrar o programa.\n")
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando…")
        server.shutdown()


if __name__ == "__main__":
    main()
