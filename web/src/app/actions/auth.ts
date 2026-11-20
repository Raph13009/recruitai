"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { text, type FormState } from "@/app/actions/form-state";
import { endSession, startSession } from "@/lib/auth/session";
import {
  acceptAgencyInvite,
  authenticate,
  consumePasswordResetToken,
  createAgencyWithRecruiter,
  createPasswordResetToken,
  demoRecruiter,
  usingPostgres,
} from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { ConfigError, env } from "@/lib/env";
import { clientAddress, rateLimit } from "@/lib/rate-limit";

const TEN_MINUTES = 10 * 60_000;

function appOrigin(headerList: Headers): string {
  const configured = env.publicAppUrl();
  if (configured) return configured.replace(/\/$/, "");
  const host = headerList.get("x-forwarded-host") || headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") || "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/** Opens the session cookie. Returns a message instead of throwing when the server is misconfigured. */
async function open(recruiterId: string): Promise<string | null> {
  try {
    await startSession(recruiterId);
    return null;
  } catch (err) {
    if (err instanceof ConfigError) return err.message;
    throw err;
  }
}

const loginSchema = z.object({ email: z.email(), password: z.string().min(1).max(200) });

export async function login(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: text(formData, "email") };
  if (!rateLimit(`login:${clientAddress(await headers())}`, 10, TEN_MINUTES)) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes.", values };
  }
  const parsed = loginSchema.safeParse({ email: values.email, password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { error: "Entrez votre e-mail et votre mot de passe.", values };

  const recruiter = await authenticate(parsed.data.email, parsed.data.password);
  if (!recruiter) {
    return { error: "E-mail ou mot de passe incorrect.", values };
  }
  const problem = await open(recruiter.id);
  if (problem) return { error: problem, values };
  redirect("/recruiter");
}

const signupSchema = z.object({
  agency: z.string().min(2, "Indiquez le nom de votre agence.").max(80),
  name: z.string().min(2, "Indiquez votre nom.").max(80),
  email: z.email("Cet e-mail n'est pas valide."),
  password: z.string().min(8, "Au moins 8 caractères.").max(200),
});

export async function signup(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { agency: text(formData, "agency"), name: text(formData, "name"), email: text(formData, "email") };
  if (!rateLimit(`signup:${clientAddress(await headers())}`, 5, 6 * TEN_MINUTES)) {
    return { error: "Trop de créations de compte depuis cette connexion. Réessayez plus tard.", values };
  }
  const parsed = signupSchema.safeParse({ ...values, password: String(formData.get("password") ?? "") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }

  const recruiter = await createAgencyWithRecruiter({
    agencyName: parsed.data.agency,
    fullName: parsed.data.name,
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!recruiter) return { fieldErrors: { email: "Un compte existe déjà avec cet e-mail." }, values };

  const problem = await open(recruiter.id);
  if (problem) return { error: problem, values };
  redirect("/recruiter?bienvenue=1");
}

/** One-click access to the seeded demo agency (synthetic data only). */
export async function demoLogin(): Promise<void> {
  if (!env.demoLogin()) redirect("/login");
  const recruiter = await demoRecruiter();
  if (!recruiter) redirect("/login");
  await startSession(recruiter.id);
  redirect("/recruiter");
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/");
}

const acceptInviteSchema = z.object({
  token: z.string().min(10).max(200),
  name: z.string().min(2, "Indiquez votre nom.").max(80),
  password: z.string().min(8, "Au moins 8 caractères.").max(200),
});

/** Accept a team invite: create a member account in the inviter's agency. */
export async function acceptInvite(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { name: text(formData, "name"), token: text(formData, "token") };
  if (!rateLimit(`accept-invite:${clientAddress(await headers())}`, 10, TEN_MINUTES)) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes.", values };
  }
  const parsed = acceptInviteSchema.safeParse({
    ...values,
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }

  const recruiter = await acceptAgencyInvite({
    token: parsed.data.token,
    fullName: parsed.data.name,
    password: parsed.data.password,
  });
  if (!recruiter) {
    return {
      error: "Cette invitation est invalide, expirée, ou l’e-mail a déjà un compte.",
      values,
    };
  }

  const problem = await open(recruiter.id);
  if (problem) return { error: problem, values };
  redirect("/recruiter?bienvenue=1");
}

const forgotSchema = z.object({ email: z.email() });

/** Always returns a generic success message (no account enumeration). */
export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { email: text(formData, "email") };
  if (!rateLimit(`forgot:${clientAddress(await headers())}`, 5, TEN_MINUTES)) {
    return { error: "Trop de demandes. Réessayez dans quelques minutes.", values };
  }
  if (!usingPostgres()) {
    return {
      error: "La réinitialisation de mot de passe est disponible uniquement sur l’infrastructure privée.",
      values,
    };
  }
  const parsed = forgotSchema.safeParse(values);
  if (!parsed.success) return { error: "Indiquez une adresse e-mail valide.", values };

  const headerList = await headers();
  const raw = await createPasswordResetToken(parsed.data.email);
  if (raw) {
    await sendPasswordResetEmail({
      to: parsed.data.email.trim().toLowerCase(),
      resetUrl: `${appOrigin(headerList)}/reset-password?token=${encodeURIComponent(raw)}`,
    });
  }
  return {
    ok: true,
    message:
      "Si un compte existe pour cet e-mail, un lien de réinitialisation vient d’être envoyé (valable 1 h).",
    values,
  };
}

const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Au moins 8 caractères.").max(200),
});

export async function resetPassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const values = { token: text(formData, "token") };
  if (!rateLimit(`reset:${clientAddress(await headers())}`, 8, TEN_MINUTES)) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes.", values };
  }
  if (!usingPostgres()) {
    return { error: "Réinitialisation indisponible hors base privée.", values };
  }
  const parsed = resetSchema.safeParse({
    token: values.token,
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  const ok = await consumePasswordResetToken(parsed.data.token, parsed.data.password);
  if (!ok) {
    return { error: "Ce lien est invalide ou a expiré. Demandez-en un nouveau.", values };
  }
  redirect("/login?reset=1");
}
