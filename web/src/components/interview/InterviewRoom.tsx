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

const ROLE_LABEL: Record<Role, string> = { agent: "Camille", candidate: "You" };

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function InterviewRoom({ payload }: { payload: CandidateSessionPayload }) {
  const [step, setStep] = useState<Step>(payload.status === "completed" ? "done" : "intro");
  const [mode, setMode] = useState<Mode>("audio");
  /** Candidate replies by typing instead of speaking (keeps avatar/Camille voice). */
  const [textChat, setTextChat] = useState(false);
  const [draft, setDraft] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  /** Connected but Camille has not been asked to speak yet. */
  const [awaitingStart, setAwaitingStart] = useState(false);
  const [startingSpeech, setStartingSpeech] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partial, setPartial] = useState<Turn | null>(null);
  const [exporting, setExporting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveRef = useRef<GeminiLiveClient | null>(null);
  const avatarRef = useRef<LiveAvatarSession | null>(null);
  const textChatRef = useRef(textChat);
  const turnsRef = useRef<Turn[]>([]);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const ending = useRef(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const { token, id } = payload;
  textChatRef.current = textChat;
  turnsRef.current = turns;

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
      setMicError("Microphone blocked. Allow it in the browser address bar, then try again.");
    }
  }

  function continueWithoutMic() {
    setTextChat(true);
    setStep("ready");
  }

  function geminiHandlers(opts: { onPcm?: (b64: string) => void } = {}) {
    return {
      onCaption: (role: Role, text: string) => setPartial({ role, text }),
      onTurn: addTurn,
      onEndRequested: () => void endInterview(),
      onError: (message: string) => setError(message),
      onPcm: opts.onPcm,
    };
  }

  /** Shared Gemini connect used by audio and by client-driven avatar. */
  async function connectGemini(opts: {
    enableMic: boolean;
    playLocalAudio: boolean;
    avatar?: boolean;
    onPcm?: (b64: string) => void;
  }): Promise<boolean> {
    const live = new GeminiLiveClient(token, geminiHandlers({ onPcm: opts.onPcm }), {
      enableMic: opts.enableMic,
      playLocalAudio: opts.playLocalAudio,
    });
    liveRef.current = live;
    try {
      const info = await postJson<LiveTokenInfo>("/api/gemini/token", {
        sessionId: id,
        token,
        avatar: opts.avatar === true,
      });
      await live.connect(info);
      return true;
    } catch (e) {
      live.close();
      liveRef.current = null;
      setError(e instanceof Error ? e.message : "Could not connect.");
      return false;
    }
  }

  async function startAudio(): Promise<boolean> {
    return connectGemini({ enableMic: !textChatRef.current, playLocalAudio: true });
  }

  /**
   * Avatar always runs client-driven Gemini (mic and/or text) so we can kick off speech
   * with an explicit button. The LiveAvatar Gemini connector alone stays silent until you talk.
   */
  async function startAvatar(): Promise<boolean> {
    try {
      const info = await postJson<{ sessionToken: string }>("/api/liveavatar/session", {
        sessionId: id,
        token,
        clientDriven: true,
      });
      const { LiveAvatarSession, SessionEvent } = await import("@heygen/liveavatar-web-sdk");
      const session = new LiveAvatarSession(info.sessionToken, {
        voiceChat: { defaultMuted: true },
        autoKeepAlive: true,
      });
      avatarRef.current = session;
      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) {
          session.attach(videoRef.current);
          void videoRef.current.play().catch(() => undefined);
        }
      });
      session.on(SessionEvent.SESSION_DISCONNECTED, () => {
        if (!ending.current) setError("The avatar connection was interrupted.");
      });
      await session.start();

      const ok = await connectGemini({
        enableMic: !textChatRef.current,
        playLocalAudio: false,
        avatar: true,
        onPcm: (b64) => {
          try {
            session.repeatAudio(b64);
          } catch {
            /* avatar socket may lag a chunk */
          }
        },
      });
      if (!ok) {
        await session.stop().catch(() => undefined);
        avatarRef.current = null;
      }
      return ok;
    } catch (e) {
      liveRef.current?.close();
      liveRef.current = null;
      await avatarRef.current?.stop().catch(() => undefined);
      avatarRef.current = null;
      setError(e instanceof Error ? e.message : "Could not start the avatar.");
      return false;
    }
  }

  async function start() {
    setError(null);
    setNotice(null);
    setAwaitingStart(false);
    setConnecting(true);
    setStep("live");
    let ok = false;
    if (mode === "avatar") {
      ok = await startAvatar();
      if (!ok) {
        setMode("audio");
        setNotice("Avatar unavailable. Continuing in audio-only mode.");
      }
    }
    if (!ok) ok = await startAudio();
    setConnecting(false);
    if (!ok) {
      setStep("ready");
      return;
    }
    setAwaitingStart(true);
  }

  async function beginSpeech() {
    if (!liveRef.current || startingSpeech) return;
    setStartingSpeech(true);
    setError(null);
    try {
      void videoRef.current?.play().catch(() => undefined);
      await liveRef.current.beginInterview();
      setAwaitingStart(false);
      if (textChat) setTimeout(() => draftRef.current?.focus(), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start Camille.");
    } finally {
      setStartingSpeech(false);
    }
  }

  function sendDraft() {
    const text = draft.trim();
    if (!text || paused || connecting || awaitingStart) return;
    liveRef.current?.sendText(text);
    setDraft("");
  }

  async function togglePause() {
    const next = !paused;
    setPaused(next);
    if (liveRef.current) {
      if (next) await liveRef.current.pause();
      else await liveRef.current.resume();
    }
    if (mode === "avatar" && next) videoRef.current?.pause();
    else if (mode === "avatar") void videoRef.current?.play();
  }

  async function downloadExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${token}/export`);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      // Prefer server transcript; fall back to in-memory turns if empty.
      const serverTranscript = Array.isArray(data.transcript) ? data.transcript : [];
      if (serverTranscript.length === 0 && turnsRef.current.length) {
        data.transcript = turnsRef.current.map((t, i) => ({
          seq: i + 1,
          role: t.role,
          text: t.text,
        }));
      }
      downloadJson(`recruitai-interview-${id.slice(0, 8)}.json`, data);
    } catch (e) {
      // Offline / failed fetch: still offer local transcript.
      downloadJson(`recruitai-interview-${id.slice(0, 8)}.json`, {
        exported_at: new Date().toISOString(),
        session: { id, token, status: "completed" },
        report: null,
        transcript: turnsRef.current,
        note: e instanceof Error ? e.message : "Server export unavailable; local transcript only.",
      });
    } finally {
      setExporting(false);
    }
  }

  const shownTurns = partial ? [...turns, partial] : turns;
  const lastTurns = shownTurns.slice(-6);

  if (step === "done") {
    return (
      <section className="sheet mt-8 p-8 text-center sm:p-12">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-teal-soft text-teal">✓</span>
        <h1 className="display mt-6 text-3xl font-semibold">Thanks — the interview is complete.</h1>
        <p className="mx-auto mt-4 max-w-md text-slate">
          Someone at {payload.agency} will read the report and get back to you. No decision was made by the AI.
        </p>
        <button className="btn-primary mt-8" onClick={() => void downloadExport()} disabled={exporting}>
          {exporting ? "Preparing…" : "Download JSON"}
        </button>
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
            <Fact label="Location" value={payload.job.location} />
            <Fact label="Contract" value={payload.job.contract} />
            <Fact label="Start" value={payload.job.start_date_fr} />
            <Fact label="Hours" value={payload.job.working_hours.join(" or ")} />
            <Fact label="Pay" value={`€${payload.job.salary_gross_hourly_eur.toFixed(2)} gross / hour`} />
            <Fact label="Tasks" value={payload.job.tasks} />
          </dl>
          <div className="mt-8 rounded-xl border border-teal/20 bg-teal-soft/60 p-5">
            <p className="text-sm font-semibold text-teal-deep">You are speaking with an AI</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{payload.ai_disclosure}</p>
          </div>
          <button className="btn-primary mt-8" onClick={() => setStep("mic")}>
            I understand — continue
          </button>
        </section>
      )}

      {step === "mic" && (
        <section className="sheet p-8 sm:p-10">
          <h1 className="display text-3xl font-semibold">Allow your microphone</h1>
          <p className="mt-3 max-w-md text-slate">
            The interview is voice-first by default. Your browser will ask for mic access. RecruitAI never stores
            audio — only conversation text is kept.
          </p>
          {micError && <p role="alert" className="mt-4 text-sm text-alert">{micError}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={allowMic}>Allow microphone</button>
            <button type="button" className="btn-ghost" onClick={continueWithoutMic}>
              Continue without mic (type replies)
            </button>
          </div>
        </section>
      )}

      {step === "ready" && (
        <section className="sheet p-8 sm:p-10">
          <h1 className="display text-3xl font-semibold">How do you want to interview?</h1>
          <div role="radiogroup" aria-label="Mode" className="mt-6 grid gap-3 sm:grid-cols-2">
            <ModeOption
              selected={mode === "audio"}
              onSelect={() => setMode("audio")}
              title="Audio only"
              text="Talk with Camille with no video. Recommended."
            />
            <ModeOption
              selected={mode === "avatar"}
              onSelect={() => setMode("avatar")}
              title="Avatar"
              text="Sandbox video (Wayne) with a matching male voice. Falls back to audio if unavailable."
            />
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-sheet p-4">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-[var(--teal)]"
              checked={textChat}
              onChange={(e) => setTextChat(e.target.checked)}
            />
            <span>
              <span className="block font-medium">Reply in writing</span>
              <span className="mt-1 block text-sm text-slate">
                Camille still speaks out loud (and the avatar moves). You type your answers — useful for tests without
                speech recognition.
              </span>
            </span>
          </label>

          {error && <p role="alert" className="mt-4 text-sm text-alert">{error}</p>}
          <button className="btn-primary mt-7" onClick={start} disabled={connecting}>
            Connect
          </button>
        </section>
      )}

      {step === "live" && (
        <section className="sheet overflow-hidden">
          {mode === "avatar" ? (
            <div className="relative aspect-video bg-ink">
              <video ref={videoRef} autoPlay playsInline className="size-full object-cover" />
              {connecting && <Overlay text="Connecting to avatar…" />}
            </div>
          ) : (
            <div className="relative grid h-52 place-items-center bg-gradient-to-br from-teal-soft/70 to-sheet">
              <Waveform className={`h-16 gap-1.5 text-teal [&>span]:w-1.5 ${paused || connecting || awaitingStart ? "opacity-30" : ""}`} />
              {connecting && <Overlay text="Connecting to Camille…" />}
            </div>
          )}

          <div className="p-6 sm:p-8">
            {notice && <p className="mb-4 rounded-lg bg-teal-soft/70 px-4 py-2.5 text-sm text-teal-deep">{notice}</p>}
            {error && <p role="alert" className="mb-4 rounded-lg bg-alert/10 px-4 py-2.5 text-sm text-alert">{error}</p>}

            {awaitingStart && !connecting && (
              <div className="mb-6 rounded-xl border border-teal/25 bg-teal-soft/50 p-5 text-center">
                <p className="text-sm text-ink/85">
                  Connected. Press to have Camille start speaking
                  {textChat ? " — then you will reply in writing." : "."}
                </p>
                <button
                  type="button"
                  className="btn-primary mt-4"
                  onClick={() => void beginSpeech()}
                  disabled={startingSpeech || paused}
                >
                  {startingSpeech ? "Starting…" : "Have Camille speak"}
                </button>
              </div>
            )}

            {textChat && !awaitingStart && (
              <p className="mb-4 text-xs font-medium uppercase tracking-wider text-teal">
                Text mode · Camille speaks · you type
              </p>
            )}

            <div aria-live="polite" className="min-h-32 space-y-3">
              {lastTurns.length === 0 && !connecting && !awaitingStart && (
                <p className="text-sm text-mist">
                  {textChat
                    ? "Camille is speaking. Type your reply below."
                    : "Captions will appear here when Camille speaks."}
                </p>
              )}
              {lastTurns.map((t, i) => (
                <p key={i} className={`text-base leading-relaxed ${i === lastTurns.length - 1 ? "text-ink" : "text-slate/70"}`}>
                  <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-teal">{ROLE_LABEL[t.role]}</span>
                  {t.text}
                </p>
              ))}
            </div>

            {textChat && !awaitingStart && (
              <form
                className="mt-6 flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendDraft();
                }}
              >
                <label className="sr-only" htmlFor="interview-draft">Your reply</label>
                <textarea
                  id="interview-draft"
                  ref={draftRef}
                  rows={2}
                  value={draft}
                  disabled={paused || connecting}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendDraft();
                    }
                  }}
                  placeholder="Type your reply… (Enter to send)"
                  className="min-h-[3rem] w-full flex-1 resize-y rounded-xl border border-line bg-paper px-4 py-3 text-sm text-ink outline-none focus:border-teal disabled:opacity-50"
                />
                <button type="submit" className="btn-primary shrink-0" disabled={paused || connecting || !draft.trim()}>
                  Send
                </button>
              </form>
            )}

            <div className={`flex flex-wrap items-center gap-3 ${textChat && !awaitingStart ? "mt-4" : "mt-6 border-t border-line pt-5"}`}>
              <button className="btn-ghost" onClick={togglePause} disabled={connecting || awaitingStart}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button className="btn-danger" onClick={() => void endInterview()}>
                End interview
              </button>
              {paused && (
                <span className="text-sm text-mist">
                  {textChat ? "Paused: messaging is suspended." : "Paused: nothing is being listened to."}
                </span>
              )}
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
