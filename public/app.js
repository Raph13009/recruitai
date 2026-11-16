/**
 * RecruitAI hands-free voice loop
 * States: IDLE → CAMILLE_SPEAKING → LISTENING → CANDIDATE_SPEAKING
 *       → TRANSCRIBING → THINKING → CAMILLE_SPEAKING …
 */
const $ = (id) => document.getElementById(id);

const Phase = Object.freeze({
  IDLE: "IDLE",
  CAMILLE_SPEAKING: "CAMILLE_SPEAKING",
  LISTENING: "LISTENING",
  CANDIDATE_SPEAKING: "CANDIDATE_SPEAKING",
  TRANSCRIBING: "TRANSCRIBING",
  THINKING: "THINKING",
  ERROR: "ERROR",
  DONE: "DONE",
  PAUSED: "PAUSED",
});

const PHASE_LABEL = {
  IDLE: "Prête",
  CAMILLE_SPEAKING: "Camille parle",
  LISTENING: "Écoute (parlez)",
  CANDIDATE_SPEAKING: "Vous parlez",
  TRANSCRIBING: "Transcription",
  THINKING: "Réflexion",
  ERROR: "Erreur",
  DONE: "Entretien terminé",
  PAUSED: "Conversation en pause",
};

/** Tunables (ms / levels) — keep light for 8 GB Mac */
const CFG = {
  silenceMs: 1300,
  minSpeechMs: 450,
  vadIntervalMs: 80,
  speakThreshold: 0.025,
  silenceThreshold: 0.012,
  postSpeakCooldownMs: 450,
  maxListenMs: 45000,
  maxUtteranceMs: 30000,
};

let history = [];
let started = false;
let completed = false;
let voice = true;
let handsFree = true;
let paused = false;
let phase = Phase.IDLE;
let reportPayload = null;
let requestSeq = 0;

let mediaStream = null;
let audioCtx = null;
let analyser = null;
let vadTimer = null;
let mediaRecorder = null;
let chunks = [];
let recording = false;
let speechStartedAt = 0;
let lastVoiceAt = 0;
let listenStartedAt = 0;
let utteranceStartedAt = 0;
let resumeAfterPause = null;

function setPhase(next, detail) {
  phase = next;
  const label = PHASE_LABEL[next] || next;
  $("state").textContent = detail ? `${label} — ${detail}` : label;
  $("phase-badge").textContent = next;
  $("avatar").classList.toggle("speaking", next === Phase.CAMILLE_SPEAKING);
  $("avatar").classList.toggle("recording", next === Phase.CANDIDATE_SPEAKING || next === Phase.LISTENING);
  updateMicChrome();
}

function updateMicChrome() {
  const live =
    phase === Phase.LISTENING ||
    phase === Phase.CANDIDATE_SPEAKING;
  $("mic-status").classList.toggle("live", live);
  $("mic-status").classList.toggle("paused", phase === Phase.PAUSED || paused);
  $("rec-indicator").classList.toggle("hidden", phase !== Phase.CANDIDATE_SPEAKING);
  const statusText = {
    [Phase.IDLE]: "Micro inactif",
    [Phase.CAMILLE_SPEAKING]: "Micro coupé (Camille parle)",
    [Phase.LISTENING]: "Micro actif — en attente de parole",
    [Phase.CANDIDATE_SPEAKING]: "Micro actif — parole détectée",
    [Phase.TRANSCRIBING]: "Micro coupé — transcription",
    [Phase.THINKING]: "Micro coupé — réflexion",
    [Phase.ERROR]: "Micro en erreur",
    [Phase.DONE]: "Micro arrêté",
    [Phase.PAUSED]: "Micro en pause",
  };
  $("mic-status-text").textContent = statusText[phase] || "Micro";
  $("pause-voice").textContent = paused ? "Reprendre la conversation" : "Mettre en pause";
  $("pause-voice").disabled = !started || completed;
  $("silence-ms").disabled = !started || completed;
}

function showError(msg) {
  const el = $("error");
  if (!msg) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = msg;
  el.classList.remove("hidden");
  setPhase(Phase.ERROR);
}

function setProgress(turn, max = 20) {
  const t = Math.min(turn, max);
  $("progress-text").textContent = `${t} / ${max}`;
  $("progress-fill").style.width = `${(t / max) * 100}%`;
}

function add(role, content) {
  const el = document.createElement("div");
  el.className = "msg " + (role === "assistant" ? "ai" : "user");
  const label = document.createElement("small");
  label.textContent = role === "assistant" ? "Camille · IA" : "Vous";
  const txt = document.createElement("span");
  txt.textContent = content;
  el.append(label, txt);
  $("messages").append(el);
  $("messages").scrollTop = $("messages").scrollHeight;
}

function preferredMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function rmsLevel() {
  if (!analyser) return 0;
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function stopVadLoop() {
  if (vadTimer) {
    clearInterval(vadTimer);
    vadTimer = null;
  }
}

async function ensureMic() {
  if (mediaStream && mediaStream.active) return mediaStream;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Micro non supporté par ce navigateur. Utilisez la saisie texte.");
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
      throw new Error("Permission micro refusée. Autorisez le micro ou écrivez votre réponse.");
    }
    if (err && err.name === "NotFoundError") {
      throw new Error("Aucun microphone détecté. Branchez un micro ou utilisez le clavier.");
    }
    throw new Error("Impossible d'accéder au micro : " + (err.message || err));
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  audioCtx = audioCtx || new AC();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  const source = audioCtx.createMediaStreamSource(mediaStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  return mediaStream;
}

function releaseMic() {
  stopVadLoop();
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try {
      mediaRecorder.stop();
    } catch (_) {}
  }
  mediaRecorder = null;
  recording = false;
  chunks = [];
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  if (audioCtx) {
    try {
      audioCtx.close();
    } catch (_) {}
    audioCtx = null;
  }
  analyser = null;
}

function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  $("avatar").classList.remove("speaking");
}

function setBusyControls(locked) {
  $("send").disabled = locked || !started || completed;
  $("answer").disabled = locked || !started || completed;
  $("start").disabled = started;
  $("finish").disabled = !started || completed;
}

function speak(text) {
  return new Promise((resolve) => {
    if (!voice || !("speechSynthesis" in window)) {
      setPhase(completed ? Phase.DONE : Phase.IDLE);
      resolve();
      return;
    }
    stopSpeech();
    setPhase(Phase.CAMILLE_SPEAKING);
    // Prevent echo: never listen while TTS plays
    stopVadLoop();
    if (recording) {
      try {
        mediaRecorder?.stop();
      } catch (_) {}
      recording = false;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    u.rate = 0.95;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      $("avatar").classList.remove("speaking");
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  });
}

async function afterCamilleSpoke() {
  if (completed || paused || !started) return;
  if (!handsFree) {
    setPhase(Phase.IDLE, "saisie texte");
    setBusyControls(false);
    return;
  }
  await new Promise((r) => setTimeout(r, CFG.postSpeakCooldownMs));
  if (completed || paused || !started) return;
  try {
    await startListening();
  } catch (e) {
    showError(e.message);
    setBusyControls(false);
  }
}

async function startListening() {
  showError("");
  await ensureMic();
  setPhase(Phase.LISTENING);
  setBusyControls(true);
  $("answer").disabled = false; // text fallback still available
  $("send").disabled = false;
  speechStartedAt = 0;
  lastVoiceAt = 0;
  listenStartedAt = Date.now();
  utteranceStartedAt = 0;
  stopVadLoop();
  vadTimer = setInterval(onVadTick, CFG.vadIntervalMs);
}

function beginUtteranceRecording() {
  if (recording || !mediaStream) return;
  chunks = [];
  const mime = preferredMime();
  try {
    mediaRecorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime })
      : new MediaRecorder(mediaStream);
  } catch (err) {
    showError("Format audio non supporté : " + (err.message || err));
    return;
  }
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onerror = () => showError("Erreur pendant l'enregistrement.");
  mediaRecorder.start(250);
  recording = true;
  utteranceStartedAt = Date.now();
  setPhase(Phase.CANDIDATE_SPEAKING);
}

async function endUtteranceAndProcess() {
  stopVadLoop();
  if (!recording || !mediaRecorder) {
    setPhase(Phase.LISTENING);
    await startListening();
    return;
  }
  const mimeType = mediaRecorder.mimeType || "audio/webm";
  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    try {
      mediaRecorder.stop();
    } catch (_) {
      resolve();
    }
  });
  recording = false;
  mediaRecorder = null;
  const blob = new Blob(chunks, { type: mimeType });
  chunks = [];
  if (!blob.size || blob.size < 800) {
    showError("Réponse trop courte ou silence. Réessayez ou tapez votre réponse.");
    setTimeout(() => {
      if (!paused && !completed && started) startListening().catch((e) => showError(e.message));
    }, 600);
    return;
  }
  await transcribeAndContinue(blob, mimeType);
}

async function transcribeAndContinue(blob, mimeType) {
  setPhase(Phase.TRANSCRIBING);
  setBusyControls(true);
  try {
    const fd = new FormData();
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", blob, `recording.${ext}`);
    const r = await fetch("/api/transcribe", { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Échec de transcription");
    const text = (data.text || "").trim();
    $("answer").value = text;
    if (!text || text.length < 2) {
      showError("Aucune parole détectée. Reformulez à voix haute ou utilisez le clavier.");
      setTimeout(() => {
        if (!paused && !completed && started) startListening().catch((e) => showError(e.message));
      }, 700);
      return;
    }
    showError("");
    history.push({ role: "user", content: text });
    add("user", text);
    $("answer").value = "";
    setProgress(history.filter((h) => h.role === "user").length);
    await nextTurn();
  } catch (e) {
    showError("Transcription : " + e.message);
    setBusyControls(false);
    setTimeout(() => {
      if (!paused && !completed && started) startListening().catch((err) => showError(err.message));
    }, 900);
  }
}

function onVadTick() {
  if (paused || completed || phase === Phase.CAMILLE_SPEAKING) return;
  if (phase !== Phase.LISTENING && phase !== Phase.CANDIDATE_SPEAKING) return;

  const level = rmsLevel();
  const now = Date.now();
  $("vad-meter").style.width = `${Math.min(100, level * 1200)}%`;

  if (now - listenStartedAt > CFG.maxListenMs && phase === Phase.LISTENING) {
    // Stay listening but nudge the user
    $("state").textContent = "Écoute (parlez) — toujours en attente";
  }

  if (level >= CFG.speakThreshold) {
    lastVoiceAt = now;
    if (phase === Phase.LISTENING) {
      speechStartedAt = now;
      beginUtteranceRecording();
    }
  }

  if (phase === Phase.CANDIDATE_SPEAKING) {
    if (utteranceStartedAt && now - utteranceStartedAt > CFG.maxUtteranceMs) {
      endUtteranceAndProcess();
      return;
    }
    const spokenLongEnough = speechStartedAt && now - speechStartedAt >= CFG.minSpeechMs;
    const silentLongEnough = lastVoiceAt && now - lastVoiceAt >= CFG.silenceMs;
    if (spokenLongEnough && silentLongEnough && level < CFG.silenceThreshold) {
      endUtteranceAndProcess();
    }
  }
}

async function nextTurn() {
  const seq = ++requestSeq;
  setPhase(Phase.THINKING);
  stopVadLoop();
  setBusyControls(true);
  showError("");
  try {
    const r = await fetch("/api/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history, demo: $("demo").checked }),
    });
    const data = await r.json();
    if (seq !== requestSeq) return;
    if (!r.ok) throw new Error(data.error || "Erreur serveur");
    if (data.progress) setProgress(data.progress.turn, data.progress.max);
    const reply = data.reply;
    if (reply) {
      history.push({ role: "assistant", content: reply });
      add("assistant", reply);
      await speak(reply);
      if (seq !== requestSeq) return;
      if (data.done) {
        await finishInterview();
        return;
      }
      await afterCamilleSpoke();
      return;
    }
    if (data.done) {
      await finishInterview();
      return;
    }
    await afterCamilleSpoke();
  } catch (e) {
    if (seq !== requestSeq) return;
    showError(e.message);
    add("assistant", "Impossible de contacter le modèle local. Vérifiez Ollama ou cochez le mode démo.");
    setBusyControls(false);
  }
}

function pauseConversation() {
  if (!started || completed) return;
  paused = true;
  resumeAfterPause = phase;
  stopVadLoop();
  stopSpeech();
  if (recording && mediaRecorder) {
    try {
      mediaRecorder.stop();
    } catch (_) {}
    recording = false;
  }
  setPhase(Phase.PAUSED);
  setBusyControls(false);
}

async function resumeConversation() {
  if (!started || completed) return;
  paused = false;
  showError("");
  if (handsFree) {
    try {
      await startListening();
    } catch (e) {
      showError(e.message);
    }
  } else {
    setPhase(Phase.IDLE, "saisie texte");
    setBusyControls(false);
  }
}

$("start").onclick = async () => {
  if (started) return;
  started = true;
  paused = false;
  history = [];
  reportPayload = null;
  setProgress(0);
  $("start").disabled = true;
  $("finish").disabled = false;
  showError("");
  CFG.silenceMs = Number($("silence-ms").value) || 1300;
  handsFree = $("handsfree").checked;
  if (handsFree) {
    try {
      await ensureMic();
    } catch (e) {
      showError(e.message + " L'entretien continue en saisie texte.");
      handsFree = false;
      $("handsfree").checked = false;
    }
  }
  await nextTurn();
};

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const t = $("answer").value.trim();
  if (!t || completed || phase === Phase.TRANSCRIBING || phase === Phase.THINKING) return;
  // Manual text interrupts hands-free capture
  stopVadLoop();
  stopSpeech();
  if (recording && mediaRecorder) {
    try {
      mediaRecorder.stop();
    } catch (_) {}
    recording = false;
  }
  $("answer").value = "";
  history.push({ role: "user", content: t });
  add("user", t);
  setProgress(history.filter((h) => h.role === "user").length);
  await nextTurn();
};

$("answer").onkeydown = (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("form").requestSubmit();
  }
};

async function finishInterview() {
  if (completed) return;
  completed = true;
  paused = false;
  stopVadLoop();
  stopSpeech();
  releaseMic();
  setPhase(Phase.DONE);
  setBusyControls(true);
  $("answer").disabled = true;
  $("send").disabled = true;
  $("finish").disabled = true;
  $("pause-voice").disabled = true;
  try {
    const r = await fetch("/api/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history }),
    });
    reportPayload = await r.json();
    if (!r.ok) throw new Error(reportPayload.error || "Rapport impossible");
  } catch (e) {
    reportPayload = {
      prototype: true,
      error: e.message,
      history,
      generated_at: new Date().toISOString(),
    };
  }
  $("report").classList.remove("hidden");
  $("report-content").textContent = JSON.stringify(reportPayload, null, 2);
  $("report").scrollIntoView({ behavior: "smooth" });
}

$("finish").onclick = () => finishInterview();

$("pause-voice").onclick = () => {
  if (paused) resumeConversation();
  else pauseConversation();
};

$("stop-speech").onclick = () => {
  stopSpeech();
  if (started && !completed && !paused) afterCamilleSpoke();
};

$("mute").onclick = () => {
  voice = !voice;
  $("mute").textContent = "Voix : " + (voice ? "activée" : "coupée");
  $("mute").setAttribute("aria-pressed", String(!voice));
  if (!voice) stopSpeech();
};

$("handsfree").onchange = () => {
  handsFree = $("handsfree").checked;
  if (!handsFree) {
    stopVadLoop();
    if (recording) {
      try {
        mediaRecorder?.stop();
      } catch (_) {}
      recording = false;
    }
    if (started && !completed) setPhase(Phase.IDLE, "saisie texte");
  } else if (started && !completed && !paused && phase !== Phase.CAMILLE_SPEAKING && phase !== Phase.THINKING) {
    startListening().catch((e) => showError(e.message));
  }
};

$("silence-ms").onchange = () => {
  CFG.silenceMs = Number($("silence-ms").value) || 1300;
};

$("reset").onclick = () => {
  requestSeq += 1;
  stopSpeech();
  stopVadLoop();
  releaseMic();
  history = [];
  started = false;
  completed = false;
  paused = false;
  reportPayload = null;
  setProgress(0);
  setPhase(Phase.IDLE);
  showError("");
  $("start").disabled = false;
  $("answer").value = "";
  $("answer").disabled = true;
  $("send").disabled = true;
  $("finish").disabled = true;
  $("pause-voice").disabled = true;
  $("vad-meter").style.width = "0%";
  $("messages").innerHTML =
    '<div class="notice">Vous parlez à une intelligence artificielle. Mode conversation mains libres : Camille parle, puis le micro écoute automatiquement. Vous pouvez aussi taper. Aucune donnée audio n\'est conservée après transcription.</div>';
  $("report").classList.add("hidden");
};

$("download").onclick = () => {
  const content = JSON.stringify(reportPayload || { history, prototype: true }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "entretien-demo.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Initial chrome
setPhase(Phase.IDLE);
