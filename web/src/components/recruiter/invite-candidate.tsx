"use client";

import { useActionState } from "react";
import { ExternalLinkIcon, Loader2Icon, LinkIcon, MailIcon } from "lucide-react";
import { inviteCandidate, type InviteState } from "@/app/actions/sessions";
import { CopyButton } from "@/components/recruiter/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMPTY: InviteState = {};

function mailto(link: string, jobTitle: string, agency: string) {
  const subject = `Votre premier entretien : ${jobTitle}`;
  const body = [
    "Bonjour,",
    "",
    `Voici le lien pour passer votre premier entretien pour le poste « ${jobTitle} » avec ${agency}.`,
    "Il se fait en visio avec une intervieweuse IA et dure environ cinq minutes. Vous pouvez le passer quand vous voulez, depuis votre téléphone ou votre ordinateur :",
    "",
    link,
    "",
    "L’IA ne prend aucune décision : une personne de l’agence lira le compte rendu et reviendra vers vous.",
    "",
    `L’équipe ${agency}`,
  ].join("\n");
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Creates a personal interview link for one candidate, ready to copy or send. */
export function InviteCandidate({ jobId, jobTitle, agency }: { jobId: string; jobTitle: string; agency: string }) {
  const [state, action, pending] = useActionState(inviteCandidate, EMPTY);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Field>
          <FieldLabel htmlFor={`label-${jobId}`}>Repère du candidat</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`label-${jobId}`}
              name="label"
              maxLength={80}
              placeholder="Initiales ou n° de dossier"
              autoComplete="off"
              className="sm:flex-1"
            />
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <LinkIcon />}
              Créer le lien
            </Button>
          </div>
          <FieldDescription>Pour vous y retrouver. Évitez le nom complet : il n’est pas nécessaire.</FieldDescription>
        </Field>
      </form>

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.link && (
        <div className="space-y-3 rounded-xl border border-primary/25 bg-accent/50 p-4 motion-safe:animate-rise">
          <p className="text-sm font-medium">Lien d’entretien pour {state.label}</p>
          <code className="block truncate rounded-md bg-background px-3 py-2 text-xs">{state.link}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={state.link} label="Copier le lien" />
            <Button asChild variant="outline">
              <a href={mailto(state.link, jobTitle, agency)}>
                <MailIcon /> Envoyer par e-mail
              </a>
            </Button>
            <Button asChild variant="ghost">
              <a href={state.link} target="_blank" rel="noreferrer">
                <ExternalLinkIcon /> Ouvrir
              </a>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
