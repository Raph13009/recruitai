"""RecruitAI V0.3 — local-first structured interview POC (Python 3.10+ stdlib only)."""
from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import interview

ROOT = pathlib.Path(__file__).parent
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8765"))
MODEL = os.getenv("OLLAMA_MODEL", "qwen3:0.6b")
OLLAMA = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/chat")
MAX_AUDIO_BYTES = 8 * 1024 * 1024  # 8 MB
WHISPER_DIR = ROOT / "tools" / "whisper.cpp"
WHISPER_BIN = pathlib.Path(
    os.getenv("WHISPER_BIN", str(WHISPER_DIR / "build" / "bin" / "whisper-cli"))
)
WHISPER_MODEL = pathlib.Path(
    os.getenv("WHISPER_MODEL", str(WHISPER_DIR / "models" / "ggml-tiny.bin"))
)
FFMPEG = os.getenv("FFMPEG", shutil.which("ffmpeg") or "ffmpeg")

# Loaded once; start date resolved at request time via interview.load_job().
JOB = interview.load_job()


def strip_think(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    text = re.sub(r"<\|.*?\|>", "", text)
    text = interview.strip_roleplay_prefixes(text)
    return text.strip()


def whisper_ready() -> dict:
    return {
        "bin": WHISPER_BIN.is_file() and os.access(WHISPER_BIN, os.X_OK),
        "model": WHISPER_MODEL.is_file(),
        "ffmpeg": shutil.which(FFMPEG) is not None or pathlib.Path(FFMPEG).is_file(),
        "bin_path": str(WHISPER_BIN),
        "model_path": str(WHISPER_MODEL),
    }


def parse_multipart(body: bytes, content_type: str) -> dict[str, tuple[str, bytes]]:
    """Parse a simple multipart/form-data body into {name: (filename, data)}."""
    if "boundary=" not in content_type:
        raise ValueError("En-tête multipart invalide (boundary manquant).")
    boundary = content_type.split("boundary=", 1)[1].strip().strip('"').encode()
    if not boundary:
        raise ValueError("Boundary multipart vide.")
    parts: dict[str, tuple[str, bytes]] = {}
    for chunk in body.split(b"--" + boundary):
        if not chunk or chunk in (b"--\r\n", b"--", b"--\n"):
            continue
        if chunk.startswith(b"--"):
            continue
        if chunk.startswith(b"\r\n"):
            chunk = chunk[2:]
        header_blob, _, data = chunk.partition(b"\r\n\r\n")
        if not data:
            continue
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = header_blob.decode("utf-8", errors="replace")
        name_m = re.search(r'name="([^"]+)"', headers)
        if not name_m:
            continue
        name = name_m.group(1)
        file_m = re.search(r'filename="([^"]*)"', headers)
        filename = file_m.group(1) if file_m else name
        parts[name] = (filename, data)
    return parts


def convert_to_wav(src: pathlib.Path, dst: pathlib.Path) -> None:
    cmd = [
        FFMPEG,
        "-y",
        "-i",
        str(src),
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "FFmpeg introuvable. Installez-le (ex. brew install ffmpeg) pour convertir l'audio."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Conversion audio trop longue.") from exc
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "")[-400:]
        raise RuntimeError(f"Conversion audio échouée. {detail}")


def run_whisper(wav_path: pathlib.Path) -> tuple[str, float]:
    if not WHISPER_BIN.is_file():
        raise RuntimeError(
            "whisper-cli introuvable. Lancez ./scripts/setup_whisper.sh depuis le dossier du projet."
        )
    if not WHISPER_MODEL.is_file():
        raise RuntimeError(
            "Modèle ggml-tiny.bin manquant. Lancez ./scripts/setup_whisper.sh."
        )
    out_base = wav_path.with_suffix("")
    cmd = [
        str(WHISPER_BIN),
        "-m",
        str(WHISPER_MODEL),
        "-l",
        "fr",
        "-np",
        "-nt",
        "-f",
        str(wav_path),
        "-otxt",
        "-of",
        str(out_base),
    ]
    started = time.perf_counter()
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180, check=False)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Transcription trop longue (timeout 180s).") from exc
    elapsed = time.perf_counter() - started
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "")[-400:]
        raise RuntimeError(f"Échec whisper.cpp. {detail}")
    txt_path = pathlib.Path(str(out_base) + ".txt")
    text = ""
    if txt_path.is_file():
        text = txt_path.read_text(encoding="utf-8", errors="replace").strip()
        txt_path.unlink(missing_ok=True)
    if not text:
        lines = []
        for line in (proc.stdout or "").splitlines():
            if "-->" in line:
                lines.append(line.split("]", 1)[-1].strip())
            elif line.strip() and not line.startswith("whisper_") and ":" not in line[:20]:
                lines.append(line.strip())
        text = " ".join(lines).strip()
    return text, elapsed


def _naturalize_keeps_facts(stage: str, scripted: str, reply: str, job: dict) -> bool:
    """Reject Qwen output that drops required facts, invents amounts, or repeats a stale intro."""
    low = reply.lower()
    if low.startswith(("question :", "réponse :", "reponse :")):
        return False
    # Tiny models often ignore the new scripted line and re-ask the intro readiness question.
    stale_intro = (
        "commencer cet entretien" in low
        or "commencer l'entretien" in low
        or "commencer l’entretien" in low
    )
    if stage != "intro" and stale_intro:
        return False
    if stage == "intro":
        if "camille" not in low:
            return False
        if "interim" not in low and job["agency"].lower() not in low:
            return False
        if "lyon" not in low and job["location"].lower() not in low:
            return False
        if job["job_title"].split("/")[0].strip().lower().split()[0] not in low and "quai" not in low and "manutention" not in low:
            return False
    stage_needles = {
        "experience": ("logistique", "manutention", "expérience", "experience", "tâches", "taches", "débutant", "debutant"),
        "availability": ("disponible", "disponibilité", "disponibilite", "à partir", "a partir", "début", "debut"),
        "hours": ("horaire", "créneau", "creneau", "6:00", "6h", "13:00", "13h", "20:00", "20h"),
        "salary": ("salaire", "rémunér", "remuner", "12,50", "12.50", "brut"),
        "questions": ("question",),
        "closing": ("merci", "recruteur", "clôtur", "clotur", "au revoir"),
    }
    needles = stage_needles.get(stage)
    if needles and not any(n in low for n in needles):
        return False
    if "?" in scripted and "?" not in reply and stage not in ("closing",):
        return False
    # Only enforce salary digits when the scripted line itself states them
    if "12,50" in scripted and "12,50" not in reply and "12.50" not in reply:
        return False
    # Official slots only required when script presents both windows
    if "6:00" in scripted or "6h" in scripted.lower():
        if "6:00" not in reply and "6h" not in low and "6 h" not in low:
            return False
    if re.search(r"\d+[.,]\d+\s*€", reply) and "12,50" not in reply and "12.50" not in reply:
        return False
    return True


def call_ollama_naturalize(history: list, stage: str, scripted: str, job: dict) -> str:
    """Ask Qwen only to rephrase the composed line; fall back if off-topic."""
    msgs = interview.naturalize_prompt(stage, scripted, job, history)
    payload = json.dumps(
        {
            "model": MODEL,
            "messages": msgs,
            "stream": False,
            "think": False,
            "options": {"num_ctx": 2048, "num_predict": 180, "temperature": 0.25},
        }
    ).encode()
    req = urllib.request.Request(
        OLLAMA, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.load(resp)
    reply = strip_think(data["message"]["content"])
    if not reply or interview.looks_off_topic(reply):
        return scripted
    if not _naturalize_keeps_facts(stage, scripted, reply, job):
        return scripted
    return reply


class Handler(BaseHTTPRequestHandler):
    server_version = "RecruitAI/0.3"

    def send_json(self, code: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_body(self, limit: int) -> bytes:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            raise ValueError("Corps de requête vide.")
        if length > limit:
            raise ValueError("Payload trop volumineux.")
        return self.rfile.read(length)

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            w = whisper_ready()
            job = interview.load_job()
            return self.send_json(
                200,
                {
                    "ok": True,
                    "version": "0.3",
                    "model": MODEL,
                    "mode": "local",
                    "job": {
                        "agency": job["agency"],
                        "title": job["job_title"],
                        "location": job["location"],
                        "start_date": job["start_date"],
                    },
                    "whisper": w,
                    "host": HOST,
                    "port": PORT,
                },
            )
        if path == "/api/job":
            return self.send_json(200, interview.load_job())
        if path == "/":
            path = "/index.html"
        file = (ROOT / "public" / path.lstrip("/")).resolve()
        public_root = (ROOT / "public").resolve()
        if not file.is_relative_to(public_root) or not file.is_file():
            return self.send_error(404)
        data = file.read_bytes()
        mime = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
        }.get(file.suffix, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/next":
                return self.handle_next()
            if path == "/api/transcribe":
                return self.handle_transcribe()
            if path == "/api/report":
                return self.handle_report()
            return self.send_error(404)
        except ValueError as exc:
            return self.send_json(400, {"error": str(exc)[:400]})
        except RuntimeError as exc:
            return self.send_json(503, {"error": str(exc)[:500]})
        except (urllib.error.URLError, TimeoutError) as exc:
            return self.send_json(
                503,
                {
                    "error": "Ollama indisponible. Lancez l'application Ollama et tirez qwen3:0.6b, ou activez le mode démo.",
                    "detail": str(exc)[:200],
                },
            )
        except Exception as exc:  # noqa: BLE001 — surface unexpected errors as JSON
            return self.send_json(500, {"error": f"Erreur serveur: {exc}"[:400]})

    def handle_next(self) -> None:
        body = json.loads(self._read_body(30_000))
        history = body.get("history", [])
        if not isinstance(history, list) or len(history) > 40:
            raise ValueError("Historique invalide.")
        job = interview.load_job()
        demo = bool(body.get("demo"))
        turn = interview.process_turn(history, job, demo=demo)
        reply = turn.reply
        mode = "scripted"
        if not demo and turn.mode_hint == "naturalize":
            try:
                reply = call_ollama_naturalize(history, turn.stage, turn.reply, job)
                mode = "ollama"
            except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError):
                # Fall back to predefined line rather than failing the interview
                reply = turn.reply
                mode = "scripted"
        return self.send_json(
            200,
            {
                "reply": reply,
                "done": turn.done,
                "mode": mode,
                "stage": turn.stage,
                "intent": turn.intent,
                "interrupted": turn.interrupted,
                "slots": turn.slots.as_dict(),
                "progress": {
                    "turn": turn.progress_turn,
                    "max": turn.progress_max,
                    "stage": turn.stage,
                },
            },
        )

    def handle_report(self) -> None:
        body = json.loads(self._read_body(60_000))
        history = body.get("history", [])
        if not isinstance(history, list):
            raise ValueError("Historique invalide.")
        return self.send_json(200, interview.build_report(history, interview.load_job()))

    def handle_transcribe(self) -> None:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            raise ValueError("Aucun fichier audio reçu.")
        if length > MAX_AUDIO_BYTES:
            return self.send_json(413, {"error": "Fichier audio trop volumineux (max 8 Mo)."})
        content_type = self.headers.get("Content-Type", "")
        raw = self.rfile.read(length)
        filename = "audio.webm"
        audio_bytes = raw
        if "multipart/form-data" in content_type:
            parts = parse_multipart(raw, content_type)
            if "audio" not in parts and "file" not in parts:
                raise ValueError("Champ audio manquant dans le formulaire.")
            filename, audio_bytes = parts.get("audio") or parts["file"]
        elif "application/json" in content_type:
            payload = json.loads(raw)
            import base64

            b64 = payload.get("audio_base64") or payload.get("data")
            if not b64:
                raise ValueError("audio_base64 manquant.")
            audio_bytes = base64.b64decode(b64)
            filename = payload.get("filename") or "audio.webm"
        if not audio_bytes or len(audio_bytes) < 64:
            raise ValueError("Enregistrement vide ou trop court.")

        tmp_dir = pathlib.Path(tempfile.mkdtemp(prefix="recruitai-audio-"))
        try:
            suffix = pathlib.Path(filename).suffix.lower() or ".webm"
            if suffix not in {".webm", ".wav", ".mp3", ".ogg", ".m4a", ".mp4", ".mpeg", ".mpga"}:
                suffix = ".webm"
            src = tmp_dir / f"input{suffix}"
            wav = tmp_dir / "audio.wav"
            src.write_bytes(audio_bytes)
            convert_to_wav(src, wav)
            if wav.stat().st_size < 100:
                raise ValueError("Audio converti vide. Réessayez en parlant plus clairement.")
            text, elapsed = run_whisper(wav)
            if not text:
                raise ValueError(
                    "Aucune parole détectée. Réessayez ou saisissez votre réponse au clavier."
                )
            return self.send_json(
                200,
                {
                    "text": text,
                    "language": "fr",
                    "latency_sec": round(elapsed, 2),
                    "model": "ggml-tiny",
                },
            )
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def log_message(self, fmt: str, *args) -> None:
        return


def main() -> None:
    w = whisper_ready()
    job = interview.load_job()
    print(f"RecruitAI POC v0.3: http://{HOST}:{PORT} | model={MODEL}")
    print(f"job: {job['job_title']} @ {job['agency']} ({job['location']}) — début {job['start_date_fr']}")
    print(
        "whisper:",
        "ready" if w["bin"] and w["model"] else "MISSING — run ./scripts/setup_whisper.sh",
        "| ffmpeg:",
        "ok" if w["ffmpeg"] else "MISSING",
    )
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
