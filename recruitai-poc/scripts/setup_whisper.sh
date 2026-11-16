#!/usr/bin/env bash
# Build whisper.cpp (tiny multilingual) for RecruitAI V0.2.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WHISPER_DIR="$ROOT/tools/whisper.cpp"
export PATH="${HOME}/Library/Python/3.13/bin:${HOME}/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake manquant. Installation via pip..."
  python3 -m pip install --user cmake
fi
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ATTENTION: ffmpeg est requis pour convertir l'audio du navigateur."
  echo "Installez-le (Homebrew Apple Silicon: brew install ffmpeg) puis relancez."
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git est requis."; exit 1
fi

mkdir -p "$ROOT/tools"
if [[ ! -d "$WHISPER_DIR/.git" ]]; then
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "$WHISPER_DIR"
fi

cd "$WHISPER_DIR"
cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_CCACHE=OFF
cmake --build build -j --config Release
./models/download-ggml-model.sh tiny

BIN="$WHISPER_DIR/build/bin/whisper-cli"
MODEL="$WHISPER_DIR/models/ggml-tiny.bin"
if [[ ! -x "$BIN" || ! -f "$MODEL" ]]; then
  echo "Échec: binaire ou modèle manquant."; exit 1
fi
echo "OK — whisper-cli: $BIN"
echo "OK — modèle: $MODEL"
echo "Test rapide (optionnel): $BIN -m $MODEL -l fr -np -f samples/jfk.wav"
