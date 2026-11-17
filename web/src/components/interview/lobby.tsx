"use client";

import {
  KeyboardIcon, Loader2Icon, MicIcon, MicOffIcon, VideoIcon, VideoOffIcon,
} from "lucide-react";
import { LevelMeter, SelfView } from "@/components/interview/self-view";
import type { MicState } from "@/components/interview/devices";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CandidateSessionPayload } from "@/lib/db/types";

const MIC_HELP: Record<Exclude<MicState, "ready">, string> = {
  idle: "Activez votre micro pour vérifier qu'on vous entend.",
  requesting: "Votre navigateur vous demande l'accès au micro…",
  denied: "Le micro est bloqué. Autorisez-le dans la barre d'adresse du navigateur, puis réessayez.",
  unavailable: "Aucun micro n'a été trouvé sur cet appareil.",
};

/** Waiting room: the candidate checks mic and camera, then joins. */
export function Lobby({
  payload,
  mic,
  camera,
  joining,
  error,
  onJoin,
}: {
  payload: CandidateSessionPayload;
  mic: { state: MicState; enable: () => Promise<boolean>; getLevel: () => number };
  camera: { stream: MediaStream | null; on: boolean; error: string | null; toggle: () => void };
  joining: boolean;
  error: string | null;
  /** `typed`: join without a mic and answer in writing (the interviewer still speaks). */
  onJoin: (typed: boolean) => void;
}) {
  const { job, experience } = payload;
  const demo = experience.engine === "demo";
  const micReady = mic.state === "ready";
  // The demo also accepts typed answers, so the mic is optional there.
  const canJoin = micReady || demo;

  return (
    <div className="flex min-h-[calc(100svh-4.5rem)] flex-col items-center justify-center px-4 pb-10 sm:px-6">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div>
          <p className="text-sm text-muted-foreground">{payload.agency}</p>
          <h1 className="display mt-1 text-2xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-3xl">
            {job.title}
          </h1>
        </div>

        <section aria-label="Vérification du micro et de la caméra">
          <div className="dark relative aspect-video overflow-hidden rounded-2xl bg-background text-foreground ring-1 ring-black/10">
            <SelfView stream={camera.stream} muted={!micReady} speaking={false} badges={false} className="size-full rounded-none ring-0" />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/60 to-transparent p-4">
              <span className="flex items-center gap-2 text-sm text-white/90">
                {micReady ? (
                  <>
                    <LevelMeter getLevel={mic.getLevel} active className="h-4 text-primary" />
                    Micro OK
                  </>
                ) : (
                  <>
                    <MicOffIcon className="size-4" /> Micro inactif
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                <RoundToggle
                  label={micReady ? "Micro activé" : "Activer le micro"}
                  active={micReady}
                  busy={mic.state === "requesting"}
                  onClick={() => void mic.enable()}
                  on={<MicIcon />}
                  off={<MicOffIcon />}
                />
                <RoundToggle
                  label={camera.on ? "Couper la caméra" : "Activer la caméra (facultatif)"}
                  active={camera.on}
                  onClick={camera.toggle}
                  on={<VideoIcon />}
                  off={<VideoOffIcon />}
                />
              </div>
            </div>
          </div>
          {!micReady && (
            <p className="mt-2 text-sm text-muted-foreground">{MIC_HELP[mic.state as Exclude<MicState, "ready">]}</p>
          )}
          {camera.error && <p className="mt-1 text-sm text-destructive">{camera.error}</p>}
        </section>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-11 rounded-full px-6 text-base"
            onClick={() => onJoin(false)}
            disabled={!canJoin || joining}
          >
            {joining ? <Loader2Icon className="animate-spin" /> : <VideoIcon />}
            {joining ? "Connexion…" : "Rejoindre"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => onJoin(true)}
            disabled={joining}
          >
            <KeyboardIcon />
            Sans micro
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoundToggle({
  label,
  active,
  busy,
  onClick,
  on,
  off,
}: {
  label: string;
  active: boolean;
  busy?: boolean;
  onClick: () => void;
  on: React.ReactNode;
  off: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={active}
          disabled={busy}
          className={
            "grid size-11 place-items-center rounded-full outline-none transition-colors focus-visible:ring-3 focus-visible:ring-white/60 disabled:opacity-60 [&>svg]:size-5 " +
            (active ? "bg-white/15 text-white hover:bg-white/25" : "bg-destructive text-destructive-foreground hover:bg-destructive/85")
          }
        >
          {busy ? <Loader2Icon className="animate-spin" /> : active ? on : off}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
