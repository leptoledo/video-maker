#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f "whisperx_env/bin/python" ]; then
    echo "Motor de transcrição não encontrado."
    echo "Por favor, rode o PREPARAR_MAC.command primeiro!"
    read -p "Pressione Enter para sair..."
    exit 1
fi

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
    VALID_PYTHON="whisperx_env/bin/python"
fi

echo "Iniciando Lctnet Video Maker..."
"$VALID_PYTHON" lctnet_video_maker.py
