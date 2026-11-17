"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { text } from "@/app/actions/form-state";
import { requireRecruiter } from "@/lib/auth/dal";
import { completeSession, createSession, deleteSession, getJob, getSession } from "@/lib/db";
import { sendInviteEmail } from "@/lib/email/invite";

export interface InviteState {
  error?: string;
  /** Soft notice when the link was created but email could not be sent. */
  notice?: string;
  /** The interview link (shown after invite for copy / local testing). */
  link?: string;
  email?: string;
}

function interviewOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

const inviteSchema = z.object({
  jobId: z.string().min(1),
  email: z.email("Indiquez un e-mail valide."),
});

/** Creates a one-attempt interview link and emails it to the candidate via Resend. */
export async function inviteCandidate(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const recruiter = await requireRecruiter();
  const parsed = inviteSchema.safeParse({
    jobId: text(formData, "jobId"),
    email: text(formData, "email").trim().toLowerCase(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Indiquez un e-mail valide." };
  }

  const job = await getJob(recruiter.agency.id, parsed.data.jobId);
  if (!job || job.status !== "open") {
    return { error: "Ce poste n'accepte pas de nouveaux entretiens (il est introuvable ou fermé)." };
  }

  const session = await createSession(recruiter.agency.id, {
    jobId: job.id,
    candidateEmail: parsed.data.email,
  });
  if (!session) return { error: "Impossible de créer l’invitation pour ce poste." };

  const link = `${interviewOrigin(await headers())}/interview/${session.token}`;
  const emailResult = await sendInviteEmail({
    to: parsed.data.email,
    agencyName: recruiter.agency.name,
    jobTitle: job.title,
    interviewUrl: link,
  });

  refresh();

  if (emailResult.sent) {
    return { link, email: parsed.data.email };
  }
  if (emailResult.reason === "missing_key") {
    return {
      link,
      email: parsed.data.email,
      notice: "Invitation créée. L’e-mail n’a pas été envoyé (RESEND_API_KEY manquant) — copiez le lien pour tester.",
    };
  }
  return {
    link,
    email: parsed.data.email,
    notice: `Invitation créée, mais l’e-mail a échoué : ${emailResult.detail ?? "erreur d’envoi"}. Copiez le lien ci-dessous.`,
  };
}

/** Closes an interview the candidate left open, and builds the report from what was said. */
export async function closeSession(formData: FormData): Promise<void> {
  const recruiter = await requireRecruiter();
  const session = await getSession(recruiter.agency.id, text(formData, "id"));
  if (session && session.status !== "completed") await completeSession(session.token, "left");
  refresh();
}

/** Deletes an interview with its transcript and report. There is no undo. */
export async function removeSession(formData: FormData): Promise<void> {
  const recruiter = await requireRecruiter();
  await deleteSession(recruiter.agency.id, text(formData, "id"));
  redirect("/recruiter/sessions");
}
