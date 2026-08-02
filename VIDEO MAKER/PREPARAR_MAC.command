#!/bin/bash
cd "$(dirname "$0")"

echo "============================================================"
echo "  LCTNET VIDEO MAKER - Instalador para macOS"
echo "============================================================"
echo ""

VALID_PYTHON=""
for py in python3.11 python3.12 python3.10 python3; do
    if command -v "$py" &> /dev/null; then
        VERSION=$("$py" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        MAJOR=$(echo "$VERSION" | cut -d. -f1)
        MINOR=$(echo "$VERSION" | cut -d. -f2)
        if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ] && [ "$MINOR" -le 12 ]; then
            VALID_PYTHON="$py"
            break
        fi
    fi
done

if [ -z "$VALID_PYTHON" ]; then
    echo "Erro: Nenhuma versão compatível do Python foi encontrada!"
    echo "O WhisperX e o PyTorch exigem Python 3.10, 3.11 ou 3.12."
    echo "O seu 'python3' atual é incompatível (muito novo, como 3.13/3.14, ou muito antigo)."
    echo ""
    echo "Por favor, baixe e instale o Python 3.11 oficial do link abaixo:"
    echo "https://www.python.org/downloads/release/python-3119/"
    echo ""
    read -p "Pressione Enter para sair..."
    exit 1
fi

echo ">> Usando Python compatível encontrado: $VALID_PYTHON"
echo ""

if [ -f "whisperx_env/bin/python" ]; then
    ENV_VERSION=$("whisperx_env/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null)
    ENV_MAJOR=$(echo "$ENV_VERSION" | cut -d. -f1)
    ENV_MINOR=$(echo "$ENV_VERSION" | cut -d. -f2)
    if [ "$ENV_MAJOR" != "3" ] || [ "$ENV_MINOR" -lt 10 ] || [ "$ENV_MINOR" -gt 12 ]; then
        echo ">> Detectado um ambiente antigo incompatível (Python $ENV_VERSION). Removendo..."
        rm -rf whisperx_env
    fi
fi

if [ ! -d "whisperx_env" ]; then
    echo ">> 1. Criando ambiente para o motor de transcrição..."
    "$VALID_PYTHON" -m venv whisperx_env
else
    echo ">> 1. Ambiente para motor de transcrição já existe e é compatível."
fi

echo ">> 2. Instalando WhisperX (Isso pode demorar alguns minutos. Baixa aprox. 2GB)..."
source whisperx_env/bin/activate
pip install --upgrade pip
pip install whisperx av matplotlib "numpy<2" "transformers<4.44.0"
deactivate

echo ">> 3. Instalando componentes do aplicativo principal..."
"$VALID_PYTHON" -m pip install imageio-ffmpeg av anthropic pyinstaller

echo ""
echo "============================================================"
echo "  INSTALAÇÃO CONCLUÍDA NO SEU MAC!"
echo "  Agora você tem duas opções para iniciar:"
echo "  A) Dê um clique duplo em INICIAR_MAC.command para abrir direto."
echo "  B) Dê um clique duplo em COMPILAR_MAC.command para gerar um executável próprio do Mac."
echo "============================================================"
read -p "Pressione Enter para fechar..."
