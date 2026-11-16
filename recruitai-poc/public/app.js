const $ = (id) => document.getElementById(id);

let history = [];
let started = false;
let completed = false;
let voice = true;
let busy = false;
let mediaRecorder = null;
let mediaStream = null;
let chunks = [];
let recording = false;
let reportPayload = null;
let requestSeq = 0;

const STATES = {
  ready: "Prête",
  recording: "Enregistrement",
  transcribing: "Transcription",
  thinking: "Réflexion",
  speaking: "Camille parle",
  listening: "À votre écoute",
  done: "Entretien terminé",
  error: "Erreur",
};

function setState(key, detail) {
  $("state").textContent = detail ? `${STATES[key] || key} — ${detail}` : (STATES[key] || key);
  $("avatar").classList.toggle("speaking", key === "speaking");
  $("avatar").classList.toggle("recording", key === "recording");
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
  setState("error");
}

function setProgress(turn, max = 12) {
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

function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  $("avatar").classList.remove("speaking");
}

function speak(text) {
  if (!voice || !("speechSynthesis" in window)) {
    setState(started && !completed ? "listening" : "ready");
    return;
  }
  stopSpeech();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "fr-FR";
  u.rate = 0.95;
  u.onstart = () => setState("speaking");
  u.onend = () => setState(completed ? "done" : "listening");
  u.onerror = () => setState(completed ? "done" : "listening");
  window.speechSynthesis.speak(u);
}

function setBusy(v) {
  busy = v;
  const locked = v || !started || completed;
  $("send").disabled = locked;
  $("answer").disabled = locked;
  $("mic").disabled = locked || recording;
  $("start").disabled = started;
  $("finish").disabled = !started || completed;
}

function preferredMime() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const t of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

async function startRecording() {
  showError("");
  if (!navigator.mediaDevices?.getUserMedia) {
    showError("Micro non supporté par ce navigateur. Utilisez la saisie texte.");
    return;
  }
  if (!window.MediaRecorder) {
    showError("MediaRecorder indisponible. Utilisez la saisie texte.");
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
      showError("Permission micro refusée. Autorisez le micro ou écrivez votre réponse.");
    } else if (err && err.name === "NotFoundError") {
      showError("Aucun microphone détecté. Branchez un micro ou utilisez le clavier.");
    } else {
      showError("Impossible d'accéder au micro : " + (err.message || err));
    }
    return;
  }
  chunks = [];
  const mime = preferredMime();
  try {
    mediaRecorder = mime ? new MediaRecorder(mediaStream, { mimeType: mime }) : new MediaRecorder(mediaStream);
  } catch (err) {
    showError("Format audio non supporté : " + (err.message || err));
    mediaStream.getTracks().forEach((t) => t.stop());
    return;
  }
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  mediaRecorder.onerror = () => showError("Erreur pendant l'enregistrement.");
  mediaRecorder.start();
  recording = true;
  $("mic").textContent = "Arrêter et transcrire";
  $("mic").classList.add("active");
  $("rec-indicator").classList.remove("hidden");
  setState("recording");
  $("send").disabled = true;
  $("answer").disabled = true;
}

async function stopRecordingAndTranscribe() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  const mimeType = mediaRecorder.mimeType || "audio/webm";
  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
  });
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  recording = false;
  $("mic").textContent = "Commencer à parler";
  $("mic").classList.remove("active");
  $("rec-indicator").classList.add("hidden");

  const blob = new Blob(chunks, { type: mimeType });
  chunks = [];
  if (!blob.size) {
    showError("Enregistrement vide. Réessayez en parlant après avoir cliqué.");
    setBusy(false);
    setState("listening");
    return;
  }
  setBusy(true);
  setState("transcribing");
  try {
    const fd = new FormData();
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", blob, `recording.${ext}`);
    const r = await fetch("/api/transcribe", { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Échec de transcription");
    $("answer").value = data.text || "";
    $("answer").focus();
    showError("");
    setState("listening", data.latency_sec ? `${data.latency_sec}s` : "");
  } catch (e) {
    showError("Transcription : " + e.message);
  } finally {
    setBusy(false);
  }
}

$("mic").onclick = async () => {
  if (busy && !recording) return;
  if (!recording) await startRecording();
  else await stopRecordingAndTranscribe();
};

async function nextTurn() {
  const seq = ++requestSeq;
  setBusy(true);
  setState("thinking");
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
      speak(reply);
    }
    if (data.done) {
      await finishInterview();
      return;
    }
  } catch (e) {
    if (seq !== requestSeq) return;
    showError(e.message);
    add("assistant", "Impossible de contacter le modèle local. Vérifiez Ollama ou cochez le mode démo.");
    setState("error");
  } finally {
    if (seq === requestSeq) setBusy(false);
  }
}

$("start").onclick = () => {
  if (started) return;
  started = true;
  history = [];
  reportPayload = null;
  setProgress(0);
  $("start").disabled = true;
  $("finish").disabled = false;
  setBusy(false);
  showError("");
  nextTurn();
};

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const t = $("answer").value.trim();
  if (!t || busy || completed) return;
  $("answer").value = "";
  stopSpeech();
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
  stopSpeech();
  recording = false;
  setBusy(true);
  setState("done");
  $("answer").disabled = true;
  $("send").disabled = true;
  $("mic").disabled = true;
  $("finish").disabled = true;
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
  setBusy(false);
}

$("finish").onclick = () => finishInterview();
$("stop-speech").onclick = () => {
  stopSpeech();
  if (started && !completed) setState("listening");
};
$("mute").onclick = () => {
  voice = !voice;
  $("mute").textContent = "Voix : " + (voice ? "activée" : "coupée");
  $("mute").setAttribute("aria-pressed", String(!voice));
  if (!voice) stopSpeech();
};
$("reset").onclick = () => {
  requestSeq += 1;
  stopSpeech();
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch (_) {}
  }
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  recording = false;
  history = [];
  started = false;
  completed = false;
  reportPayload = null;
  $("mic").textContent = "Commencer à parler";
  $("mic").classList.remove("active");
  $("rec-indicator").classList.add("hidden");
  $("start").disabled = false;
  $("answer").value = "";
  $("answer").disabled = true;
  $("send").disabled = true;
  $("mic").disabled = true;
  $("finish").disabled = true;
  setProgress(0);
  setState("ready");
  showError("");
  $("messages").innerHTML =
    '<div class="notice">Vous parlez à une intelligence artificielle. Cet entretien est un prototype, non utilisé pour une décision de recrutement. Aucune donnée audio n\'est conservée après transcription.</div>';
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
