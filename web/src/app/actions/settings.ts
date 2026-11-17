"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { text, type FormState } from "@/app/actions/form-state";
import { requireOwner } from "@/lib/auth/dal";
import { isAccentColor } from "@/lib/branding";
import {
  assertBrandingImage,
  removeAgencyAsset,
  uploadAgencyAsset,
  type BrandingKind,
} from "@/lib/branding/storage";
import { getAgency, updateAgency, updateAgencyBranding, updateInterviewer } from "@/lib/db";

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
  const recruiter = await requireOwner();
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
  const recruiter = await requireOwner();
  const values = { name: text(formData, "name") };
  const parsed = agencySchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message }, values };
  await updateAgency(recruiter.agency.id, parsed.data);
  refresh();
  return { ok: true, values };
}

const BRANDING_FIELDS = [
  { kind: "logo", url: "logo_url" },
  { kind: "banner", url: "banner_url" },
] as const satisfies readonly { kind: BrandingKind; url: "logo_url" | "banner_url" }[];

/** Agency branding shown to candidates: accent color, logo and banner. */
export async function saveBranding(_previous: FormState, formData: FormData): Promise<FormState> {
  const recruiter = await requireOwner();
  const agencyId = recruiter.agency.id;
  const accent = text(formData, "accent_color");
  if (!isAccentColor(accent)) {
    return { fieldErrors: { accent_color: "Choisissez une couleur #RRGGBB." }, error: "Certains réglages sont à corriger." };
  }

  const current = await getAgency(agencyId);
  if (!current) return { error: "Agence introuvable." };

  // Validate every file before touching storage.
  const uploads: { kind: BrandingKind; url: "logo_url" | "banner_url"; file: File }[] = [];
  const removals: typeof BRANDING_FIELDS[number][] = [];
  const fieldErrors: Record<string, string> = {};
  for (const field of BRANDING_FIELDS) {
    const file = formData.get(field.kind);
    if (file instanceof File && file.size > 0) {
      const problem = assertBrandingImage(file, field.kind);
      if (problem) fieldErrors[field.kind] = problem;
      else uploads.push({ ...field, file });
    } else if (formData.get(`remove_${field.kind}`) === "1") {
      removals.push(field);
    }
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Certains réglages sont à corriger." };

  const next = { ...current.branding, accent_color: accent };
  try {
    for (const { kind, url, file } of uploads) next[url] = await uploadAgencyAsset(agencyId, kind, file);
    for (const { kind, url } of removals) {
      await removeAgencyAsset(agencyId, kind);
      next[url] = null;
    }
  } catch {
    return { error: "Impossible d'enregistrer les images. Réessayez." };
  }
  await updateAgencyBranding(agencyId, next);
  refresh();
  return { ok: true };
}
