"use client";

import { useActionState } from "react";
import { ExternalLinkIcon, Loader2Icon, MailIcon } from "lucide-react";
import { inviteCandidate, type InviteState } from "@/app/actions/sessions";
import { CopyButton } from "@/components/recruiter/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMPTY: InviteState = {};

/** Sends a one-attempt interview invitation by email (Resend). */
export function InviteCandidate({ jobId }: { jobId: string; jobTitle: string; agency: string }) {
  const [state, action, pending] = useActionState(inviteCandidate, EMPTY);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="jobId" value={jobId} />
        <Field>
          <FieldLabel htmlFor={`email-${jobId}`}>E-mail du candidat</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`email-${jobId}`}
              name="email"
              type="email"
              required
              maxLength={254}
              placeholder="candidat@exemple.fr"
              autoComplete="email"
              className="sm:flex-1"
            />
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
              Envoyer l’invitation
            </Button>
          </div>
          <FieldDescription>
            Un lien personnel unique, une seule tentative. Le compte rendu apparaîtra ici après l’entretien.
          </FieldDescription>
        </Field>
      </form>

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state.notice && (
        <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          {state.notice}
        </p>
      )}

      {state.link && (
        <div className="space-y-3 rounded-xl border border-primary/25 bg-accent/50 p-4 motion-safe:animate-rise">
          <p className="text-sm font-medium">
            {state.notice ? "Lien d’entretien" : `Invitation envoyée à ${state.email}`}
          </p>
          <code className="block truncate rounded-md bg-background px-3 py-2 text-xs">{state.link}</code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={state.link} label="Copier le lien" />
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
