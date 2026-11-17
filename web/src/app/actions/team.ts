"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { text, type FormState } from "@/app/actions/form-state";
import { requireOwner } from "@/lib/auth/dal";
import { createAgencyInvite, getAgency, revokeAgencyInvite } from "@/lib/db";
import { sendTeamInviteEmail } from "@/lib/email/team-invite";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

export type TeamInviteState = FormState & {
  inviteUrl?: string;
  notice?: string;
};

const inviteSchema = z.object({
  email: z.email("Cet e-mail n'est pas valide."),
});

function appOrigin(hdrs: Headers): string {
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/** Owner invites a colleague as member of the same agency. */
export async function inviteTeammate(_previous: TeamInviteState, formData: FormData): Promise<TeamInviteState> {
  const owner = await requireOwner();
  const values = { email: text(formData, "email") };
  if (!rateLimit(`team-invite:${clientAddress(await headers())}`, 20, 10 * 60_000)) {
    return { error: "Trop d’invitations. Réessayez dans quelques minutes.", values };
  }
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message ?? "E-mail invalide." }, values };
  }

  const invite = await createAgencyInvite({
    agencyId: owner.agency.id,
    email: parsed.data.email,
    invitedBy: owner.id,
  });
  if (!invite) {
    return {
      fieldErrors: { email: "Cet e-mail a déjà un compte RecruitAI." },
      values,
    };
  }

  const inviteUrl = `${appOrigin(await headers())}/invite/${invite.token}`;
  const agency = await getAgency(owner.agency.id);
  const mailed = await sendTeamInviteEmail({
    to: invite.email,
    agencyName: agency?.name ?? owner.agency.name,
    inviterName: owner.full_name,
    inviteUrl,
  });

  refresh();
  return {
    ok: true,
    values: { email: "" },
    inviteUrl,
    notice: mailed.sent
      ? "Invitation envoyée."
      : mailed.reason === "missing_key"
        ? "Invitation créée. L’e-mail n’a pas été envoyé (clé Resend absente) : copiez le lien."
        : "Invitation créée, mais l’e-mail a échoué : copiez le lien.",
  };
}

export async function revokeTeammateInvite(formData: FormData): Promise<void> {
  const owner = await requireOwner();
  const id = text(formData, "invite_id");
  if (!id) return;
  await revokeAgencyInvite(owner.agency.id, id);
  refresh();
}
