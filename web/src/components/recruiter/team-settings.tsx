"use client";

import { useActionState } from "react";
import { Loader2Icon } from "lucide-react";
import { inviteTeammate, revokeTeammateInvite, type TeamInviteState } from "@/app/actions/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AgencyInvite, Recruiter } from "@/lib/db/types";

const EMPTY: TeamInviteState = {};

/** Stable FR date (avoids Node vs browser `toLocaleDateString` hydration drift). */
function formatInviteDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function TeamSettings({
  members,
  invites,
  canInvite,
}: {
  members: Recruiter[];
  invites: AgencyInvite[];
  canInvite: boolean;
}) {
  const [state, action, pending] = useActionState(inviteTeammate, EMPTY);
  const errors = state.fieldErrors ?? {};

  return (
    <div className="space-y-6">
      <ul className="divide-y rounded-xl border">
        {members.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{member.full_name}</p>
              <p className="truncate text-sm text-muted-foreground">{member.email}</p>
            </div>
            <Badge variant={member.role === "owner" ? "default" : "secondary"}>
              {member.role === "owner" ? "Owner" : "Member"}
            </Badge>
          </li>
        ))}
      </ul>

      {canInvite && (
        <form action={action} className="space-y-4">
          <FieldGroup>
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="team-email">Inviter un collègue</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="team-email"
                  name="email"
                  type="email"
                  placeholder="prenom@agence.fr"
                  defaultValue={state.values?.email}
                  aria-invalid={Boolean(errors.email)}
                  required
                  className="sm:flex-1"
                />
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2Icon className="animate-spin" /> : null}
                  Envoyer
                </Button>
              </div>
              {errors.email && <FieldError>{errors.email}</FieldError>}
              <p className="text-sm text-muted-foreground">
                Le collègue crée son compte et rejoint l’agence en tant que member (envoi
                d’entretiens uniquement).
              </p>
            </Field>
          </FieldGroup>
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
          {state.inviteUrl && (
            <p className="break-all rounded-lg border px-3 py-2 text-sm">
              Lien : {state.inviteUrl}
            </p>
          )}
        </form>
      )}

      {canInvite && invites.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Invitations en attente</p>
          <ul className="divide-y rounded-xl border">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                    Expire le {formatInviteDate(invite.expires_at)}
                  </p>
                </div>
                <form action={revokeTeammateInvite}>
                  <input type="hidden" name="invite_id" value={invite.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Annuler
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
