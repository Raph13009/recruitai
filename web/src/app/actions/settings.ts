"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { text, type FormState } from "@/app/actions/form-state";
import { requireRecruiter } from "@/lib/auth/dal";
import { updateAgency, updateInterviewer } from "@/lib/db";

const interviewerSchema = z.object({
  persona_name: z.string().min(1, "Donnez un prénom à l'intervieweur.").max(30),
  // Any Gemini Live voice name: the curated list in the form, or one set by hand.
  voice: z.string().regex(/^[A-Za-z]{2,40}$/, "Choisissez une voix."),
  video_enabled: z.boolean(),
  avatar_id: z.union([z.uuid(), z.literal("")]),
  avatar_name: z.string().max(120),
  avatar_preview_url: z.union([z.url({ protocol: /^https$/ }), z.literal("")]),
});

/** Who the candidates meet: name, voice and face of the AI interviewer. */
export async function saveInterviewer(_previous: FormState, formData: FormData): Promise<FormState> {
  const recruiter = await requireRecruiter();
  const parsed = interviewerSchema.safeParse({
    persona_name: text(formData, "persona_name"),
    voice: text(formData, "voice"),
    video_enabled: formData.get("video_enabled") === "on",
    avatar_id: text(formData, "avatar_id"),
    avatar_name: text(formData, "avatar_name"),
    avatar_preview_url: text(formData, "avatar_preview_url"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, error: "Certains réglages sont à corriger." };
  }
  const data = parsed.data;
  await updateInterviewer(recruiter.agency.id, {
    persona_name: data.persona_name,
    voice: data.voice,
    video_enabled: data.video_enabled,
    avatar_id: data.avatar_id || null,
    avatar_name: data.avatar_id ? data.avatar_name || null : null,
    avatar_preview_url: data.avatar_id ? data.avatar_preview_url || null : null,
  });
  refresh();
  return { ok: true };
}

const agencySchema = z.object({ name: z.string().min(2, "Indiquez le nom de l'agence.").max(80) });

export async function saveAgency(_previous: FormState, formData: FormData): Promise<FormState> {
  const recruiter = await requireRecruiter();
  const values = { name: text(formData, "name") };
  const parsed = agencySchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message }, values };
  await updateAgency(recruiter.agency.id, parsed.data);
  refresh();
  return { ok: true, values };
}
