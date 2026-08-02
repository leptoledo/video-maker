#!/bin/bash
cd "$(dirname "$0")"

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
    echo "Erro: Python 3.10, 3.11 ou 3.12 não encontrado no seu Mac."
    echo "Por favor, instale o Python 3.11 (https://www.python.org/downloads/release/python-3119/)"
    read -p "Pressione Enter para fechar..."
    exit 1
fi

echo "Instalando dependencias necessárias para compilação..."
"$VALID_PYTHON" -m pip install pyinstaller anthropic imageio-ffmpeg av

echo ""
echo "Compilando o aplicativo para macOS (isso pode levar alguns minutos)..."
echo ""

# No Mac, o separador do add-data é ":" em vez de ";"
"$VALID_PYTHON" -m PyInstaller --onefile --icon=NONE --name="LctnetVideoMaker" --add-data="config.json:." --add-data="logo.png:." --add-data="_ref_capcut_imagens.json:." lctnet_video_maker.py

echo ""
echo "======================================================="
echo "COMPILAÇÃO CONCLUÍDA COM SUCESSO!"
echo "Abra a pasta 'dist' que foi criada."
echo "Lá dentro está o arquivo 'LctnetVideoMaker' (executável do Mac)."
echo "Mova ele para esta pasta principal (onde está a pasta whisperx_env)."
echo "Depois disso, basta dar dois cliques nele para usar o app!"
echo "======================================================="
read -p "Pressione Enter para fechar..."
