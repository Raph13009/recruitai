"use client";

import {
  CalendarIcon, ClockIcon, EuroIcon, FileTextIcon, InfoIcon, KeyboardIcon, Loader2Icon, MapPinIcon, MicIcon,
  MicOffIcon, PackageIcon, SparklesIcon, VideoIcon, VideoOffIcon,
} from "lucide-react";
import { LevelMeter, SelfView } from "@/components/interview/self-view";
import type { MicState } from "@/components/interview/devices";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CandidateSessionPayload } from "@/lib/db/types";
import { formatEur } from "@/lib/format";

const MIC_HELP: Record<Exclude<MicState, "ready">, string> = {
  idle: "Activez votre micro pour vérifier qu'on vous entend.",
  requesting: "Votre navigateur vous demande l'accès au micro…",
  denied: "Le micro est bloqué. Autorisez-le dans la barre d'adresse du navigateur, puis réessayez.",
  unavailable: "Aucun micro n'a été trouvé sur cet appareil.",
};

/** Waiting room: the candidate reads what the interview is, checks mic and camera, then joins. */
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
  const persona = experience.persona_name;
  const demo = experience.engine === "demo";
  const micReady = mic.state === "ready";
  // The demo also accepts typed answers, so the mic is optional there.
  const canJoin = micReady || demo;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 pt-2 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-start lg:gap-12">
      <section aria-label="Vérification du micro et de la caméra" className="lg:sticky lg:top-6">
        <div className="dark relative aspect-video overflow-hidden rounded-3xl bg-background text-foreground shadow-xl ring-1 ring-black/10">
          <SelfView stream={camera.stream} muted={!micReady} speaking={false} badges={false} className="size-full rounded-none ring-0" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/60 to-transparent p-4">
            <span className="flex items-center gap-2 text-sm text-white/90">
              {micReady ? (
                <>
                  <LevelMeter getLevel={mic.getLevel} active className="h-4 text-primary" />
                  Parlez pour tester votre micro
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
        <p className="mt-3 text-sm text-muted-foreground">
          {micReady ? "Votre micro fonctionne." : MIC_HELP[mic.state as Exclude<MicState, "ready">]} La caméra est
          facultative : son image reste sur votre appareil, elle n’est ni transmise ni enregistrée.
        </p>
        {camera.error && <p className="mt-1 text-sm text-destructive">{camera.error}</p>}
      </section>

      <section>
        <p className="eyebrow">{payload.agency}</p>
        <h1 className="display mt-3 text-3xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-4xl">
          {job.title}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary">
            {demo ? "Mode démonstration" : experience.video ? "Visio avec avatar IA" : "Entretien vocal"}
          </Badge>
          <Badge variant="outline">Environ 5 minutes</Badge>
        </div>

        <dl className="mt-6 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Fact icon={<MapPinIcon />} label="Lieu" value={job.location} />
          <Fact icon={<CalendarIcon />} label="Début" value={job.start_date_fr} />
          <Fact icon={<ClockIcon />} label="Horaires" value={job.working_hours.join(" ou ")} />
          <Fact icon={<EuroIcon />} label="Salaire" value={`${formatEur(job.salary_gross_hourly_eur)} brut / heure`} />
          <Fact icon={<FileTextIcon />} label="Contrat" value={job.contract} />
          <Fact icon={<PackageIcon />} label="Tâches" value={job.tasks} />
        </dl>

        <Alert className="mt-7 border-primary/25 bg-accent/60">
          <SparklesIcon className="text-primary" />
          <AlertTitle>Vous allez parler avec une IA</AlertTitle>
          <AlertDescription className="text-foreground/80">{payload.ai_disclosure}</AlertDescription>
        </Alert>

        {demo && (
          <Alert className="mt-3">
            <InfoIcon />
            <AlertTitle>Mode démonstration</AlertTitle>
            <AlertDescription>
              Aucune clé vocale n’est configurée : {persona} suit un script et parle avec la voix de votre navigateur.
              Vous pouvez répondre à l’oral ou par écrit. La voix en temps réel et l’avatar vidéo s’activent avec les
              clés Gemini et LiveAvatar.
            </AlertDescription>
          </Alert>
        )}
        {experience.sandbox && (
          <Alert className="mt-3">
            <InfoIcon />
            <AlertTitle>Avatar en bac à sable</AlertTitle>
            <AlertDescription>
              Le service d’avatar est en mode test : un visage de démonstration apparaît pendant environ une minute,
              puis l’entretien continue en audio.
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-11 rounded-full px-6 text-base"
            onClick={() => onJoin(false)}
            disabled={!canJoin || joining}
          >
            {joining ? <Loader2Icon className="animate-spin" /> : <VideoIcon />}
            {joining ? "Connexion…" : "Rejoindre l’entretien"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => onJoin(true)}
            disabled={joining}
          >
            <KeyboardIcon />
            Continuer sans micro
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {canJoin
            ? `Installez-vous au calme. ${persona} termine toujours ses phrases avant de vous écouter. Vous pouvez quitter quand vous voulez.`
            : "Activez votre micro pour répondre à l’oral."}{" "}
          Sans micro, {persona} vous parle toujours à voix haute et vous répondez par écrit.
        </p>
      </section>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-primary [&>svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 [overflow-wrap:anywhere]">{value}</dd>
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
