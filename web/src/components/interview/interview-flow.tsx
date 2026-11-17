"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { CallRoom, type CallPhase, type Caption } from "@/components/interview/call-room";
import { useCamera, useMicCheck } from "@/components/interview/devices";
import { Lobby } from "@/components/interview/lobby";
import { postJson, type EngineHandlers, type InterviewEngine } from "@/lib/client/engine";
import { startInterview } from "@/lib/client/start-interview";
import type { CandidateSessionPayload, EndReason } from "@/lib/db/types";
import { EMPTY_PROGRESS, type InterviewProgress } from "@/lib/interview/progress";
import { ofName } from "@/lib/interview/prompt";

type Step = "lobby" | "call" | "done";

/** How long a finished sentence stays on screen as a caption. */
const CAPTION_LINGER_MS = 7000;

/** The candidate's whole journey on an interview link: waiting room, video call, goodbye. */
export function InterviewFlow({ payload }: { payload: CandidateSessionPayload }) {
  const { token, experience } = payload;
  const alreadyDone = payload.status === "completed";

  const [step, setStep] = useState<Step>(alreadyDone ? "done" : "lobby");
  const [phase, setPhase] = useState<CallPhase>("connecting");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [videoActive, setVideoActive] = useState(false);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [candidateSpeaking, setCandidateSpeaking] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  /** The candidate chose to answer in writing, without a mic (Camille still speaks aloud). */
  const [typedReplies, setTypedReplies] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [progress, setProgress] = useState<InterviewProgress>(EMPTY_PROGRESS);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endReason, setEndReason] = useState<EndReason | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<InterviewEngine | null>(null);
  const endingRef = useRef(false);
  const everLiveRef = useRef(false);
  const micMutedRef = useRef(false);
  const typedRepliesRef = useRef(false);
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mic = useMicCheck();
  const camera = useCamera();
  const stopCamera = camera.stop;
  const takeMicStream = mic.takeStream;
  const enableMic = mic.enable;

  const showCaption = useCallback((next: Caption) => {
    setCaption(next);
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), CAPTION_LINGER_MS);
  }, []);

  const end = useCallback(
    async (reason: EndReason) => {
      if (endingRef.current) return;
      endingRef.current = true;
      const engine = engineRef.current;
      engineRef.current = null;
      const mode = engine?.video ? "avatar" : "audio";
      engine?.close();
      await engine?.settle().catch(() => undefined);
      await postJson(`/api/sessions/${token}/complete`, { reason, mode }).catch(() => undefined);
      stopCamera();
      setEndReason(reason);
      setStep("done");
    },
    [token, stopCamera],
  );

  /** Must run straight from a click: browsers only let audio and video start on a user gesture. */
  const join = useCallback(
    (micStream: MediaStream | null) => {
      if (endingRef.current) return;
      const attempt = { failed: false };
      setJoinError(null);
      setCallError(null);
      setNotice(null);
      setJoining(true);
      setPhase("connecting");
      setStep("call");

      const fail = (message: string) => {
        attempt.failed = true;
        engineRef.current?.close();
        engineRef.current = null;
        micStream?.getTracks().forEach((t) => t.stop());
        setJoining(false);
        setAgentSpeaking(false);
        setCandidateSpeaking(false);
        setVideoActive(false);
        if (everLiveRef.current) {
          setCallError(message);
          setPhase("error");
        } else {
          // Never connected: back to the waiting room with the reason.
          setJoinError(message);
          setStep("lobby");
        }
      };

      const handlers: EngineHandlers = {
        onCaption: (role, text) => showCaption({ role, text }),
        onTurn: (role, text) => showCaption({ role, text }),
        onProgress: setProgress,
        onAgentSpeaking: setAgentSpeaking,
        onCandidateSpeaking: setCandidateSpeaking,
        onVideo: setVideoActive,
        onNotice: setNotice,
        onEnded: () => void end("completed"),
        onError: fail,
      };

      startInterview({
        token,
        wantVideo: experience.video,
        video: videoRef.current,
        micEnabled: !typedRepliesRef.current,
        micStream,
        handlers,
      })
        .then(({ engine, needsClick }) => {
          if (attempt.failed || endingRef.current) {
            engine.close();
            return;
          }
          engineRef.current = engine;
          void engine.setMicMuted(micMutedRef.current);
          everLiveRef.current = true;
          setStartedAt((t) => t ?? Date.now());
          setJoining(false);
          setPhase(needsClick ? "ready" : "live");
        })
        .catch((err: unknown) => {
          if (!attempt.failed) fail(err instanceof Error ? err.message : "Connexion impossible.");
        });
    },
    [token, experience.video, end, showCaption],
  );

  /**
   * From the waiting room. Voice join requests the mic inside this click when needed so iOS
   * keeps the user gesture for getUserMedia + audio unlock.
   */
  const joinFromLobby = useCallback(
    (typed: boolean) => {
      typedRepliesRef.current = typed;
      setTypedReplies(typed);
      micMutedRef.current = typed;
      setMicMuted(typed);
      if (typed) {
        takeMicStream()?.getTracks().forEach((t) => t.stop());
        join(null);
        return;
      }
      // Mic already open: stay synchronous so AudioContext/TTS unlock stay in the gesture.
      if (mic.state === "ready") {
        join(takeMicStream());
        return;
      }
      setJoining(true);
      setJoinError(null);
      void enableMic().then((ok) => {
        if (!ok) {
          setJoining(false);
          setJoinError("Autorisez le micro, ou continuez avec « Sans micro ».");
          return;
        }
        join(takeMicStream());
      });
    },
    [join, takeMicStream, enableMic, mic.state],
  );

  const toggleMic = useCallback(() => {
    const next = !micMutedRef.current;
    micMutedRef.current = next;
    setMicMuted(next);
    void engineRef.current?.setMicMuted(next).then((applied) => {
      if (applied || micMutedRef.current !== next) return;
      // The mic could not be opened: show it as off again.
      micMutedRef.current = true;
      setMicMuted(true);
    });
  }, []);

  /** The browser blocked the sound at first: this click lets the interviewer speak. */
  const startSpeaking = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.unlock().then((audible) => {
      engine.begin();
      setPhase("live");
      if (!audible) setNotice("Le son semble bloqué : vérifiez le volume et que le son est autorisé pour ce site.");
    });
  }, []);

  const sendText = useCallback((text: string) => engineRef.current?.sendText(text), []);
  const getAgentLevel = useCallback(() => engineRef.current?.agentLevel() ?? 0, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const leave = useCallback(() => void end("left"), [end]);

  useEffect(
    () => () => {
      engineRef.current?.close();
      if (captionTimer.current) clearTimeout(captionTimer.current);
    },
    [],
  );

  const finished = step === "done";

  return (
    <>
      {step !== "call" && (
        <header className="flex items-center px-4 py-4 sm:px-6">
          {/* Clickable only when finished — leaving mid-interview would end the session by mistake. */}
          <Brand href={finished ? "/" : null} />
        </header>
      )}

      {step === "lobby" && (
        <Lobby payload={payload} mic={mic} camera={camera} joining={joining} error={joinError} onJoin={joinFromLobby} />
      )}

      {finished && (
        <Goodbye agency={payload.agency} reason={alreadyDone ? "already" : (endReason ?? "completed")} />
      )}

      {!finished && (
        <CallRoom
          visible={step === "call"}
          phase={phase}
          persona={experience.persona_name}
          agency={payload.agency}
          jobTitle={payload.job.title}
          demo={experience.engine === "demo"}
          videoRef={videoRef}
          videoActive={videoActive}
          agentSpeaking={agentSpeaking}
          candidateSpeaking={candidateSpeaking}
          getAgentLevel={getAgentLevel}
          caption={caption}
          progress={progress}
          notice={notice}
          error={callError}
          startedAt={startedAt}
          micMuted={micMuted}
          typedReplies={typedReplies}
          cameraStream={camera.stream}
          onToggleMic={toggleMic}
          onToggleCamera={camera.toggle}
          onSendText={sendText}
          onDismissNotice={dismissNotice}
          onStartSpeaking={startSpeaking}
          onRetry={() => join(null)}
          onLeave={leave}
        />
      )}
    </>
  );
}

function Goodbye({ agency, reason }: { agency: string; reason: EndReason | "already" }) {
  const title =
    reason === "already"
      ? "Cet entretien est déjà terminé."
      : reason === "left"
        ? "Vous avez quitté l’entretien."
        : "Merci, l’entretien est terminé.";
  return (
    <section className="mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-xl flex-col items-center justify-center px-6 pb-16 text-center motion-safe:animate-rise">
      <span className="grid size-14 place-items-center rounded-full bg-accent text-accent-foreground">
        <CheckIcon className="size-6" />
      </span>
      <h1 className="display mt-6 text-3xl font-semibold sm:text-4xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-md text-muted-foreground">
        Une personne {ofName(agency).replace("'", "’")} lit le compte rendu et revient vers vous.
      </p>
      <p className="mt-6 text-sm text-muted-foreground">Vous pouvez fermer cette page, ou cliquer sur le logo pour revenir à l’accueil.</p>
    </section>
  );
}
