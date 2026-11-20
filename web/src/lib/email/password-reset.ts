import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
}

export type PasswordResetEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "missing_key" | "send_failed"; detail?: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildPasswordResetEmail(input: PasswordResetEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = "Réinitialisation de votre mot de passe RecruitAI";
  const text = [
    `Bonjour,`,
    ``,
    `Une demande de réinitialisation de mot de passe a été faite pour votre compte RecruitAI.`,
    `Ce lien est valide une heure et ne peut être utilisé qu’une seule fois :`,
    ``,
    input.resetUrl,
    ``,
    `Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.`,
    ``,
    `— RecruitAI`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f1ea;font-family:system-ui,-apple-system,sans-serif;color:#16212b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#fffdf8;border-radius:16px;padding:32px 28px;border:1px solid #e5e0d6;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#2f6b4f;">RecruitAI</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;font-weight:600;">Réinitialiser votre mot de passe</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#3a4650;">
                Ce lien est valable <strong>une heure</strong> et ne peut être utilisé qu’une seule fois.
              </p>
              <p style="margin:0 0 24px;">
                <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#2f6b4f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;">
                  Choisir un nouveau mot de passe
                </a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7280;">
                Si le bouton ne fonctionne pas, copiez ce lien :<br/>
                <span style="word-break:break-all;">${escapeHtml(input.resetUrl)}</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

/** Sends the reset mail. Without RESEND_API_KEY, skips sending (link still created server-side). */
export async function sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<PasswordResetEmailResult> {
  const built = buildPasswordResetEmail(input);
  const key = env.resendApiKey();
  if (!key) {
    console.info("[email] RESEND_API_KEY missing — password reset token created but email not sent.");
    return { sent: false, reason: "missing_key" };
  }
  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: env.resendFrom(),
      to: input.to,
      subject: built.subject,
      text: built.text,
      html: built.html,
    });
    if (error || !data?.id) {
      return { sent: false, reason: "send_failed", detail: error?.message };
    }
    return { sent: true, id: data.id };
  } catch (err) {
    return {
      sent: false,
      reason: "send_failed",
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}
