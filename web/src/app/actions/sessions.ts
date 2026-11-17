"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { text } from "@/app/actions/form-state";
import { requireRecruiter } from "@/lib/auth/dal";
import { completeSession, createSession, deleteSession, getSession } from "@/lib/db";

export interface InviteState {
  error?: string;
  /** The interview link to send to the candidate. */
  link?: string;
  label?: string;
}

/** Creates an interview link for a candidate on one of the agency's open jobs. */
export async function inviteCandidate(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const recruiter = await requireRecruiter();
  const label = text(formData, "label").slice(0, 80);
  const session = await createSession(recruiter.agency.id, { jobId: text(formData, "jobId"), candidateLabel: label });
  if (!session) return { error: "Ce poste n'accepte pas de nouveaux entretiens (il est introuvable ou fermé)." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  refresh();
  return { link: `${protocol}://${host}/interview/${session.token}`, label: session.candidate_label };
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
