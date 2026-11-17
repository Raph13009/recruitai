import { Badge } from "@/components/ui/badge";
import type { EndReason, InterviewEngineKind, InterviewMode, JobStatus, SessionStatus } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const SESSION_STYLES: Record<SessionStatus | "left", string> = {
  created: "bg-muted text-muted-foreground",
  in_progress: "bg-warning/15 text-warning",
  completed: "bg-accent text-accent-foreground",
  left: "bg-secondary text-secondary-foreground",
};

export function sessionStatusLabel(status: SessionStatus, endReason?: EndReason | null): string {
  if (status === "completed") return endReason === "left" ? "Interrompu" : "Terminé";
  return status === "in_progress" ? "En cours" : "En attente";
}

export function SessionStatusBadge({ status, endReason }: { status: SessionStatus; endReason?: EndReason | null }) {
  const key = status === "completed" && endReason === "left" ? "left" : status;
  return <Badge className={cn("border-transparent", SESSION_STYLES[key])}>{sessionStatusLabel(status, endReason)}</Badge>;
}

const JOB_LABELS: Record<JobStatus, string> = { open: "Ouvert", draft: "Brouillon", closed: "Fermé" };
const JOB_STYLES: Record<JobStatus, string> = {
  open: "bg-accent text-accent-foreground",
  draft: "bg-muted text-muted-foreground",
  closed: "bg-secondary text-secondary-foreground",
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge className={cn("border-transparent", JOB_STYLES[status])}>{JOB_LABELS[status]}</Badge>;
}

/** How the interview ran: video avatar, voice only, or scripted demo. */
export function modeLabel(mode: InterviewMode | null, engine: InterviewEngineKind | null): string | null {
  if (engine === "demo") return "Démo (voix du navigateur)";
  if (mode === "avatar") return "Visio avec avatar";
  if (mode === "audio") return "Voix seule";
  return null;
}
