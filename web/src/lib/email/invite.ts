import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

export interface InviteEmailInput {
  to: string;
  agencyName: string;
  jobTitle: string;
  interviewUrl: string;
}

export type InviteEmailResult =
  | { sent: true; id: string }
  | { sent: false; reason: "missing_key" | "send_failed"; detail?: string };

/** Plain-text + HTML invitation: unique link, one attempt only. */
export function buildInviteEmail(input: InviteEmailInput): { subject: string; text: string; html: string } {
  const subject = `Invitation à l’entretien : ${input.jobTitle}`;
  const text = [
    `Bonjour,`,
    ``,
    `${input.agencyName} vous invite à passer un entretien pour le poste « ${input.jobTitle} ».`,
    ``,
    `L’entretien se fait en ligne avec une intervieweuse IA et dure environ cinq minutes.`,
    `Vous n’avez qu’une seule tentative : une fois l’entretien terminé, ce lien ne pourra plus être réutilisé.`,
    ``,
    `Ouvrez votre lien personnel :`,
    input.interviewUrl,
    ``,
    `Si le lien ne s’ouvre pas, copiez-le dans votre navigateur.`,
    ``,
    `L’équipe ${input.agencyName}`,
    `— via RecruitAI`,
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
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;font-weight:600;">Invitation à l’entretien</h1>
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#3a4650;">
                <strong>${escapeHtml(input.agencyName)}</strong> vous invite pour le poste
                <strong>« ${escapeHtml(input.jobTitle)} »</strong>.
              </p>
              <p style="margin:0 0 12px;font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#3a4650;">
                L’entretien dure environ cinq minutes, en ligne. Vous n’avez
                <strong>qu’une seule tentative</strong> : une fois terminé, ce lien ne pourra plus être réutilisé.
              </p>
              <p style="margin:24px 0;">
                <a href="${escapeAttr(input.interviewUrl)}"
                   style="display:inline-block;background:#2f6b4f;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,sans-serif;font-size:15px;font-weight:600;padding:12px 20px;border-radius:999px;">
                  Commencer l’entretien
                </a>
              </p>
              <p style="margin:0;font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;word-break:break-all;">
                Ou copiez ce lien :<br />${escapeHtml(input.interviewUrl)}
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

/** Sends the invitation. Without RESEND_API_KEY, skips sending so local POC still works. */
export async function sendInviteEmail(input: InviteEmailInput): Promise<InviteEmailResult> {
  const key = env.resendApiKey();
  const content = buildInviteEmail(input);
  if (!key) {
    console.info("[email] RESEND_API_KEY missing — invitation created but email not sent.", {
      to: input.to,
      jobTitle: input.jobTitle,
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
