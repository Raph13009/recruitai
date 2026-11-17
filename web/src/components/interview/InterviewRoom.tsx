"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import { Waveform } from "@/components/brand";
import { requestMicPermission } from "@/lib/client/audio";
import { GeminiLiveClient, type LiveTokenInfo, type Role } from "@/lib/client/gemini-live";
import type { CandidateSessionPayload } from "@/lib/db/types";

type Step = "intro" | "mic" | "ready" | "live" | "done";
type Mode = "audio" | "avatar";
type Turn = { role: Role; text: string };

const ROLE_LABEL: Record<Role, string> = { agent: "Camille", candidate: "Vous" };

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
  return data;
}

export function InterviewRoom({ payload }: { payload: CandidateSessionPayload }) {
  const [step, setStep] = useState<Step>(payload.status === "completed" ? "done" : "intro");
  const [mode, setMode] = useState<Mode>("audio");
  const [micError, setMicError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState<Turn | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveRef = useRef<GeminiLiveClient | null>(null);
  const avatarRef = useRef<LiveAvatarSession | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const ending = useRef(false);

  const { token, id } = payload;

  // Finished turns are shown and stored one at a time, in order. Text only.
  const addTurn = useCallback(
    (role: Role, text: string) => {
      setTurns((t) => [...t, { role, text }]);
      setPartial((p) => (p?.role === role ? null : p));
      saveQueue.current = saveQueue.current.then(() =>
        postJson(`/api/sessions/${token}/transcript`, { turns: [{ role, text }] }).catch(() => undefined),
      );
    },
    [token],
  );

  const endInterview = useCallback(async () => {
    if (ending.current) return;
    ending.current = true;
    liveRef.current?.close();
    liveRef.current = null;
    await avatarRef.current?.stop().catch(() => undefined);
    avatarRef.current = null;
    await saveQueue.current;
    await postJson(`/api/sessions/${token}/complete`).catch(() => undefined);
    setStep("done");
  }, [token]);

  useEffect(
    () => () => {
      liveRef.current?.close();
      void avatarRef.current?.stop().catch(() => undefined);
    },
    [],
  );

  async function allowMic() {
    setMicError(null);
    try {
      await requestMicPermission();
      setStep("ready");
    } catch {
      setMicError("Le micro est bloqué. Autorisez-le dans la barre d'adresse du navigateur, puis réessayez.");
    }
  }

  // Must be called straight from the click handler so the AudioContext may start.
  async function startAudio(): Promise<boolean> {
    const live = new GeminiLiveClient(token, {
      onCaption: (role, text) => setPartial({ role, text }),
      onTurn: addTurn,
      onEndRequested: () => void endInterview(),
      onError: (message) => setError(message),
    });
    liveRef.current = live;
    try {
      const info = await postJson<LiveTokenInfo>("/api/gemini/token", { sessionId: id, token });
      await live.connect(info);
      return true;
    } catch (e) {
      live.close();
      liveRef.current = null;
      setError(e instanceof Error ? e.message : "Connexion impossible.");
      return false;
    }
  }

  async function startAvatar(): Promise<boolean> {
    try {
      const info = await postJson<{ sessionToken: string }>("/api/liveavatar/session", {
        sessionId: id,
        token,
      });
      const { LiveAvatarSession, SessionEvent, AgentEventsEnum } = await import("@heygen/liveavatar-web-sdk");
      const session = new LiveAvatarSession(info.sessionToken, { voiceChat: { defaultMuted: false } });
      avatarRef.current = session;
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) session.attach(videoRef.current);
      });
      session.on(SessionEvent.SESSION_DISCONNECTED, () => {
        if (!ending.current) setError("La connexion avec l'avatar s'est interrompue.");
      });
      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => addTurn("candidate", e.text));
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => addTurn("agent", e.text));
      await session.start();
      return true;
    } catch {
      await avatarRef.current?.stop().catch(() => undefined);
      avatarRef.current = null;
      return false;
    }
  }

  async function start() {
    setError(null);
    setNotice(null);
    setConnecting(true);
    setStep("live");
    let ok = false;
    if (mode === "avatar") {
      ok = await startAvatar();
      if (!ok) {
        setMode("audio");
        setNotice("L'avatar n'est pas disponible pour le moment. L'entretien continue en audio seul.");
      }
    }
    if (!ok) ok = await startAudio();
    setConnecting(false);
    if (!ok) setStep("ready");
  }

  async function togglePause() {
    const next = !paused;
    setPaused(next);
    if (mode === "avatar") {
      const session = avatarRef.current;
      if (next) {
        await session?.voiceChat.mute();
        videoRef.current?.pause();
      } else {
        await session?.voiceChat.unmute();
        void videoRef.current?.play();
      }
    } else if (next) {
      await liveRef.current?.pause();
    } else {
      await liveRef.current?.resume();
    }
  }

  const shownTurns = partial ? [...turns, partial] : turns;
  const lastTurns = shownTurns.slice(-4);

  if (step === "done") {
    return (
      <section className="sheet mt-8 p-8 text-center sm:p-12">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-teal-soft text-teal">✓</span>
        <h1 className="display mt-6 text-3xl font-semibold">Merci, l’entretien est terminé.</h1>
        <p className="mx-auto mt-4 max-w-md text-slate">
          Une personne de {payload.agency} lira le compte rendu et reviendra vers vous. Aucune décision n’a été prise
          par l’IA. Vous pouvez fermer cette page.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-6">
      {step === "intro" && (
        <section className="sheet p-8 sm:p-10">
          <p className="eyebrow">{payload.agency}</p>
          <h1 className="display mt-3 text-3xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-4xl">{payload.job.title}</h1>
          <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <Fact label="Lieu" value={payload.job.location} />
            <Fact label="Contrat" value={payload.job.contract} />
            <Fact label="Début" value={payload.job.start_date_fr} />
            <Fact label="Horaires" value={payload.job.working_hours.join(" ou ")} />
            <Fact label="Salaire" value={`${payload.job.salary_gross_hourly_eur.toFixed(2).replace(".", ",")} € brut / heure`} />
            <Fact label="Tâches" value={payload.job.tasks} />
          </dl>
          <div className="mt-8 rounded-xl border border-teal/20 bg-teal-soft/60 p-5">
            <p className="text-sm font-semibold text-teal-deep">Vous parlez avec une IA</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{payload.ai_disclosure}</p>
          </div>
          <button className="btn-primary mt-8" onClick={() => setStep("mic")}>
            J’ai compris, continuer
          </button>
        </section>
      )}

      {step === "mic" && (
        <section className="sheet p-8 sm:p-10">
          <h1 className="display text-3xl font-semibold">Autorisez votre micro</h1>
          <p className="mt-3 max-w-md text-slate">
            L’entretien se fait à la voix. Votre navigateur va demander l’accès au micro. L’audio n’est jamais
            enregistré par RecruitAI : seul le texte de la conversation est conservé.
          </p>
          {micError && <p role="alert" className="mt-4 text-sm text-alert">{micError}</p>}
          <button className="btn-primary mt-7" onClick={allowMic}>Autoriser le micro</button>
        </section>
      )}

      {step === "ready" && (
        <section className="sheet p-8 sm:p-10">
          <h1 className="display text-3xl font-semibold">Comment voulez-vous passer l’entretien ?</h1>
          <div role="radiogroup" aria-label="Mode" className="mt-6 grid gap-3 sm:grid-cols-2">
            <ModeOption
              selected={mode === "audio"}
              onSelect={() => setMode("audio")}
              title="Audio seul"
              text="Vous parlez avec Camille, sans image. Recommandé."
            />
            <ModeOption
              selected={mode === "avatar"}
              onSelect={() => setMode("avatar")}
              title="Avatar"
              text="Camille apparaît en vidéo (bac à sable de démonstration). Bascule en audio si indisponible."
            />
          </div>
          {mode === "avatar" && (
            <p className="mt-3 text-xs text-mist">
              En mode avatar, votre voix transite aussi par le service LiveAvatar pour générer la vidéo.
            </p>
          )}
          {error && <p role="alert" className="mt-4 text-sm text-alert">{error}</p>}
          <button className="btn-primary mt-7" onClick={start} disabled={connecting}>
            Démarrer l’entretien
          </button>
        </section>
      )}

      {step === "live" && (
        <section className="sheet overflow-hidden">
          {mode === "avatar" ? (
            <div className="relative aspect-video bg-ink">
              <video ref={videoRef} autoPlay playsInline className="size-full object-cover" />
              {connecting && <Overlay text="Connexion à l’avatar…" />}
            </div>
          ) : (
            <div className="relative grid h-52 place-items-center bg-gradient-to-br from-teal-soft/70 to-sheet">
              <Waveform className={`h-16 gap-1.5 text-teal [&>span]:w-1.5 ${paused || connecting ? "opacity-30" : ""}`} />
              {connecting && <Overlay text="Connexion à Camille…" />}
            </div>
          )}

          <div className="p-6 sm:p-8">
            {notice && <p className="mb-4 rounded-lg bg-teal-soft/70 px-4 py-2.5 text-sm text-teal-deep">{notice}</p>}
            {error && <p role="alert" className="mb-4 rounded-lg bg-alert/10 px-4 py-2.5 text-sm text-alert">{error}</p>}

            <div aria-live="polite" className="min-h-32 space-y-3">
              {lastTurns.length === 0 && !connecting && (
                <p className="text-sm text-mist">Les sous-titres apparaîtront ici dès que Camille parle.</p>
              )}
              {lastTurns.map((t, i) => (
                <p key={i} className={`text-base leading-relaxed ${i === lastTurns.length - 1 ? "text-ink" : "text-slate/70"}`}>
                  <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-teal">{ROLE_LABEL[t.role]}</span>
                  {t.text}
                </p>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-5">
              <button className="btn-ghost" onClick={togglePause} disabled={connecting}>
                {paused ? "Reprendre" : "Pause"}
              </button>
              <button className="btn-danger" onClick={() => void endInterview()}>
                Terminer l’entretien
              </button>
              {paused && <span className="text-sm text-mist">En pause : rien n’est écouté.</span>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-mist">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}

function ModeOption(props: { selected: boolean; onSelect: () => void; title: string; text: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      onClick={props.onSelect}
      className={`rounded-xl border p-4 text-left transition-colors ${
        props.selected ? "border-teal bg-teal-soft/60" : "border-line bg-sheet hover:border-ink/30"
      }`}
    >
      <span className="block font-medium">{props.title}</span>
      <span className="mt-1 block text-sm text-slate">{props.text}</span>
    </button>
  );
}

function Overlay({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-sheet/70 text-sm font-medium text-ink backdrop-blur-sm">
      {text}
    </div>
  );
}
