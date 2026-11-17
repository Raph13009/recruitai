"use client";

import { useEffect, useState, type RefObject } from "react";
import {
  CaptionsIcon, CaptionsOffIcon, CheckIcon, KeyboardIcon, Loader2Icon, MicIcon, MicOffIcon, PhoneOffIcon,
  RotateCcwIcon, SendIcon, VideoIcon, VideoOffIcon, Volume2Icon, XIcon,
} from "lucide-react";
import { Presence } from "@/components/interview/presence";
import { SelfView } from "@/components/interview/self-view";
import { Waveform } from "@/components/brand";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/lib/client/engine";
import { formatClock } from "@/lib/format";
import { INTERVIEW_TOPICS, type InterviewProgress } from "@/lib/interview/progress";
import { cn } from "@/lib/utils";

/** "ready": connected, but the browser blocked the sound until the candidate clicks. */
export type CallPhase = "connecting" | "ready" | "live" | "error";

export interface Caption {
  role: Role;
  text: string;
}

export interface CallRoomProps {
  /** Hidden until the candidate joins, but mounted so the video element exists at click time. */
  visible: boolean;
  phase: CallPhase;
  persona: string;
  agency: string;
  jobTitle: string;
  demo: boolean;
  /** Receives the avatar stream. */
  videoRef: RefObject<HTMLVideoElement | null>;
  videoActive: boolean;
  agentSpeaking: boolean;
  candidateSpeaking: boolean;
  getAgentLevel: () => number;
  caption: Caption | null;
  progress: InterviewProgress;
  notice: string | null;
  error: string | null;
  startedAt: number | null;
  micMuted: boolean;
  /** The candidate joined without a mic and answers in writing. */
  typedReplies: boolean;
  cameraStream: MediaStream | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onSendText: (text: string) => void;
  onDismissNotice: () => void;
  onStartSpeaking: () => void;
  onRetry: () => void;
  onLeave: () => void;
}

/** The video-call screen, on Raphaël's paper. Only the avatar's video sits on an ink tile. */
export function CallRoom({
  visible, phase, persona, agency, jobTitle, demo, videoRef, videoActive, agentSpeaking, candidateSpeaking,
  getAgentLevel, caption, progress, notice, error, startedAt, micMuted, typedReplies, cameraStream, onToggleMic,
  onToggleCamera, onSendText, onDismissNotice, onStartSpeaking, onRetry, onLeave,
}: CallRoomProps) {
  const [captionsOn, setCaptionsOn] = useState(true);
  const [typing, setTyping] = useState(demo || typedReplies);
  // Joining without a mic opens the answer box (the room is mounted before the candidate chooses).
  const [typingFor, setTypingFor] = useState(typedReplies);
  if (typedReplies !== typingFor) {
    setTypingFor(typedReplies);
    if (typedReplies) setTyping(true);
  }
  const elapsed = useElapsed(startedAt);

  return (
    <div
      className={cn(
        "paper fixed inset-0 z-40 flex h-dvh flex-col text-foreground",
        // Keep the video element layout-alive (not display:none) so iOS can unlock playback on join.
        !visible && "invisible pointer-events-none",
      )}
      aria-hidden={!visible}
    >
      <header className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground">
          <Waveform className="h-3.5 gap-[2px] [&>span]:w-[2px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{jobTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{agency}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <ol className="hidden items-center gap-1.5 md:flex" aria-label="Sujets abordés">
            {INTERVIEW_TOPICS.map((topic) => {
              const done = progress[topic.id];
              return (
                <li
                  key={topic.id}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                    done ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {done && <CheckIcon className="size-3" />}
                  {topic.label}
                  <span className="sr-only">{done ? " : abordé" : " : à venir"}</span>
                </li>
              );
            })}
          </ol>
          <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs tabular-nums text-muted-foreground" aria-label="Durée de l'appel">
            {formatClock(elapsed)}
          </span>
        </div>
      </header>

      <main className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 px-3 sm:px-6">
        <div
          className={cn(
            "relative flex-1 overflow-hidden rounded-3xl shadow-[0_12px_32px_-18px_rgb(22_33_43/0.25)] ring-1 ring-border",
            videoActive ? "dark bg-background" : "bg-gradient-to-br from-accent/70 to-card",
          )}
        >
          {/* The avatar's video and audio. Kept mounted: the avatar session attaches to it. */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={cn("absolute inset-0 size-full object-cover", !videoActive && "invisible")}
            aria-label={`Vidéo de ${persona}, avatar généré par IA`}
          />
          {visible && !videoActive && (
            <Presence
              name={persona}
              speaking={agentSpeaking}
              getLevel={getAgentLevel}
              className="absolute inset-0"
            />
          )}

          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-background/70 py-1 pl-3 pr-1.5 text-sm backdrop-blur">
            <span className="font-medium">{persona}</span>
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground" title="Visage et voix générés par IA">
              IA
            </span>
            {agentSpeaking && <Waveform animated className="mr-1.5 h-3 text-primary" />}
          </div>

          {notice && (
            <div role="status" className="absolute inset-x-4 top-16 mx-auto flex max-w-xl items-start gap-3 rounded-xl bg-background/85 px-4 py-3 text-sm shadow-lg backdrop-blur motion-safe:animate-rise">
              <p className="flex-1">{notice}</p>
              <button type="button" onClick={onDismissNotice} aria-label="Fermer le message" className="rounded-md p-0.5 text-muted-foreground hover:text-foreground">
                <XIcon className="size-4" />
              </button>
            </div>
          )}

          {captionsOn && caption && phase === "live" && (
            <p
              aria-live="polite"
              className="absolute inset-x-4 bottom-5 mx-auto w-fit max-w-2xl rounded-xl bg-ink/80 px-4 py-2.5 text-center text-base leading-snug text-white backdrop-blur sm:bottom-6 sm:text-lg"
            >
              <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                {caption.role === "agent" ? persona : "Vous"}
              </span>
              {tail(caption.text)}
            </p>
          )}

          <SelfView
            stream={cameraStream}
            muted={micMuted}
            speaking={candidateSpeaking}
            className="absolute right-3 top-3 aspect-video w-28 shadow-lg sm:right-4 sm:top-4 sm:w-44"
          />

          {phase === "connecting" && (
            <div className="absolute inset-0 grid place-items-center bg-background/80 backdrop-blur-sm">
              <p className="flex items-center gap-3 text-sm font-medium" role="status">
                <Loader2Icon className="size-5 animate-spin text-primary" />
                Connexion à {persona}…
              </p>
            </div>
          )}

          {phase === "ready" && (
            <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 backdrop-blur-sm">
              <div className="max-w-sm text-center">
                <p className="display text-2xl font-semibold">{persona} est connectée</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Votre navigateur attend un clic avant de laisser passer le son.
                </p>
                <Button onClick={onStartSpeaking} size="lg" className="mt-5 rounded-full px-5">
                  <Volume2Icon /> Faire parler {persona}
                </Button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div className="absolute inset-0 grid place-items-center bg-background/85 p-6 backdrop-blur-sm">
              <div role="alert" className="max-w-sm text-center">
                <p className="display text-2xl font-semibold">L’appel a été interrompu</p>
                <p className="mt-2 text-sm text-muted-foreground">{error ?? "La connexion s'est interrompue."}</p>
                <p className="mt-1 text-sm text-muted-foreground">Ce que vous avez déjà dit est conservé.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button onClick={onRetry} size="lg" className="rounded-full px-4">
                    <RotateCcwIcon /> Reprendre l’entretien
                  </Button>
                  <Button onClick={onLeave} variant="outline" size="lg" className="rounded-full px-4">
                    Terminer
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {typing && phase === "live" && <TypeAnswer persona={persona} autoFocus={typedReplies} onSend={onSendText} />}

      <footer className="flex items-center justify-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:gap-3">
        <ControlButton
          label={micMuted ? (typedReplies ? "Activer le micro" : "Réactiver le micro") : "Couper le micro"}
          active={!micMuted}
          danger={micMuted && !typedReplies}
          onClick={onToggleMic}
          disabled={phase !== "live"}
        >
          {micMuted ? <MicOffIcon /> : <MicIcon />}
        </ControlButton>
        <ControlButton
          label={cameraStream ? "Couper la caméra" : "Activer la caméra"}
          active={cameraStream !== null}
          onClick={onToggleCamera}
        >
          {cameraStream ? <VideoIcon /> : <VideoOffIcon />}
        </ControlButton>
        <ControlButton
          label={captionsOn ? "Masquer les sous-titres" : "Afficher les sous-titres"}
          active={captionsOn}
          onClick={() => setCaptionsOn((on) => !on)}
        >
          {captionsOn ? <CaptionsIcon /> : <CaptionsOffIcon />}
        </ControlButton>
        <ControlButton
          label={typing ? "Fermer la saisie" : "Répondre par écrit"}
          active={typing}
          onClick={() => setTyping((on) => !on)}
        >
          <KeyboardIcon />
        </ControlButton>

        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  aria-label="Quitter l'entretien"
                  className="ml-2 grid h-12 w-16 place-items-center rounded-full bg-destructive text-destructive-foreground outline-none transition-colors hover:bg-destructive/85 focus-visible:ring-3 focus-visible:ring-destructive/40 [&>svg]:size-5"
                >
                  <PhoneOffIcon />
                </button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent>Quitter l’entretien</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Quitter l’entretien ?</AlertDialogTitle>
              <AlertDialogDescription>
                L’agence recevra le compte rendu de ce qui a été dit jusqu’ici. Vous ne pourrez pas reprendre avec ce
                lien.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuer l’entretien</AlertDialogCancel>
              <AlertDialogAction onClick={onLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/85">
                Quitter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </footer>
    </div>
  );
}

/** The end of a long caption: what is being said now matters more than how the sentence began. */
function tail(text: string, max = 150): string {
  if (text.length <= max) return text;
  const cut = text.slice(-max);
  const space = cut.indexOf(" ");
  return `… ${space >= 0 ? cut.slice(space + 1) : cut}`;
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => startedAt ?? 0);
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return startedAt === null ? 0 : Math.max(0, (now - startedAt) / 1000);
}

function ControlButton({
  label,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            "grid size-12 place-items-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 [&>svg]:size-5",
            danger
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/85"
              : active
                ? "bg-card text-foreground ring-1 ring-border hover:bg-muted"
                : "bg-muted text-muted-foreground ring-1 ring-border hover:bg-card hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TypeAnswer({
  persona,
  autoFocus,
  onSend,
}: {
  persona: string;
  autoFocus?: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="mx-auto mt-3 flex w-full max-w-2xl items-center gap-2 px-4"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = text.trim();
        if (!clean) return;
        onSend(clean);
        setText("");
      }}
    >
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={500}
        placeholder={`Écrire une réponse à ${persona}…`}
        aria-label="Votre réponse écrite"
        className="h-11 rounded-full bg-card px-4"
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <Button type="submit" size="icon-lg" className="size-11 shrink-0 rounded-full" disabled={!text.trim()} aria-label="Envoyer">
        <SendIcon />
      </Button>
    </form>
  );
}
