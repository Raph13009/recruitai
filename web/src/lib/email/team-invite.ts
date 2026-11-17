import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

export interface TeamInviteEmailInput {
  to: string;
  agencyName: string;
  inviterName: string;
  inviteUrl: string;
}

export type TeamInviteEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "missing_key" | "send_failed"; detail?: string };

/** Invitation for a colleague to create a recruiter account in the same agency. */
export function buildTeamInviteEmail(input: TeamInviteEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `${input.agencyName} — invitation à rejoindre RecruitAI`;
  const text = [
    `Bonjour,`,
    ``,
    `${input.inviterName} vous invite à rejoindre l’agence « ${input.agencyName} » sur RecruitAI.`,
    ``,
    `Vous partagerez les mêmes postes et entretiens. Créez votre compte avec ce lien :`,
    input.inviteUrl,
    ``,
    `Ce lien expire dans 7 jours.`,
    ``,
    `L’équipe ${input.agencyName}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#16212b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#fffdf8;border-radius:16px;padding:32px 28px;border:1px solid #e5e0d6;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-family:system-ui,-apple-system,sans-serif;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#2f6b4f;">RecruitAI</p>
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:600;">Rejoindre l’agence</h1>
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#3a4650;">
                <strong>${escapeHtml(input.inviterName)}</strong> vous invite à rejoindre
                <strong>« ${escapeHtml(input.agencyName)} »</strong>.
              </p>
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#3a4650;">
                Vous aurez accès aux mêmes postes et entretiens. Créez votre mot de passe pour commencer.
              </p>
              <p style="margin:24px 0;">
                <a href="${escapeAttr(input.inviteUrl)}"
                   style="display:inline-block;background:#2f6b4f;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600;padding:12px 20px;border-radius:999px;">
                  Créer mon compte
                </a>
              </p>
              <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">
                Lien valable 7 jours :<br />${escapeHtml(input.inviteUrl)}
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

export async function sendTeamInviteEmail(input: TeamInviteEmailInput): Promise<TeamInviteEmailResult> {
  const key = env.resendApiKey();
  const content = buildTeamInviteEmail(input);
  if (!key) {
    console.info("[email] RESEND_API_KEY missing — team invite created but email not sent.", {
      to: input.to,
      agencyName: input.agencyName,
    });
    return { sent: false, reason: "missing_key" };
  }

  try {
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: env.resendFrom(),
      to: input.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    if (error || !data?.id) {
      return { sent: false, reason: "send_failed", detail: error?.message ?? "Réponse Resend vide." };
    }
    return { sent: true, id: data.id };
  } catch (err) {
    return {
      sent: false,
      reason: "send_failed",
      detail: err instanceof Error ? err.message : "Envoi impossible.",
    };
  }
}
