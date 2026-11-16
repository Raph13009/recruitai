# Setup — RecruitAI V0.4

## Prerequisites
- macOS (Apple Silicon preferred; Metal used by whisper.cpp when available)
- Python 3.10+
- Official **Ollama macOS app** (do not require Homebrew Ollama)
- `git`, `cmake`, `ffmpeg`, C/C++ toolchain (Xcode Command Line Tools)
- Microphone permission in the browser (manual OS prompt)

## Install Ollama model
```bash
# Ensure Ollama.app is running
ollama pull qwen3:0.6b
```

CLI tip if `ollama` is not on PATH:
```bash
export PATH="/Applications/Ollama.app/Contents/Resources:$PATH"
```

## Build whisper.cpp
```bash
chmod +x scripts/setup_whisper.sh
./scripts/setup_whisper.sh
```
This clones `tools/whisper.cpp` if needed, builds `whisper-cli`, and downloads `models/ggml-tiny.bin` (~74 MB).

## FFmpeg
Required to convert browser recordings to 16 kHz mono WAV.
```bash
ffmpeg -version
```

## Run
```bash
python3 server.py
# → http://127.0.0.1:8765
```

Environment overrides:
- `HOST`, `PORT`
- `OLLAMA_MODEL`, `OLLAMA_URL`
- `WHISPER_BIN`, `WHISPER_MODEL`, `FFMPEG`

## Tests
```bash
python3 tests/test_server.py
```

## Manual checks remaining
- Browser microphone permission dialog (required once for hands-free)
- Full hands-free loop: Camille speaks → you answer → silence end → Whisper → Qwen → Camille speaks again
- Pause / resume mid-interview
- Text fallback while hands-free is active
- Browser TTS voices available on the machine (offline not guaranteed)
