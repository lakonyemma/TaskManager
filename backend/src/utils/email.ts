import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || "Taskly <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

if (!resend) {
    console.warn("[email] RESEND_API_KEY is not set — emails will be logged to the console instead of sent.");
}

const invitationHtml = (workspaceName: string, acceptUrl: string) => `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#060B23;padding:32px;color:#f8fafc">
    <div style="max-width:480px;margin:0 auto;background:rgba(255,255,255,0.05);border:1px solid rgba(139,92,246,0.3);border-radius:16px;padding:32px">
      <p style="letter-spacing:2px;text-transform:uppercase;font-size:12px;color:#c084fc;margin:0 0 12px">Taskly</p>
      <h1 style="font-size:22px;margin:0 0 12px">You've been invited</h1>
      <p style="color:#cbd5e1;line-height:1.6;margin:0 0 24px">
        You've been invited to join the <strong>${workspaceName}</strong> workspace on Taskly.
        Accept the invitation to start collaborating with your team.
      </p>
      <a href="${acceptUrl}"
        style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#A855F7);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">
        Accept invitation
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:24px">If the button doesn't work, copy this link: ${acceptUrl}</p>
    </div>
  </div>
`;

export const sendInvitationEmail = async (
    to: string,
    workspaceName: string,
    token: string,
): Promise<void> => {
    const acceptUrl = `${APP_URL}/register?invite=${token}`;

    if (!resend) {
        console.log("═══════════════════════════════════════════");
        console.log("[EMAIL] (dev mode, no RESEND_API_KEY) To:", to);
        console.log("[EMAIL] Subject: You're invited to", workspaceName);
        console.log("[EMAIL] Accept link:", acceptUrl);
        console.log("═══════════════════════════════════════════");
        return;
    }

    try {
        await resend.emails.send({
            from: EMAIL_FROM,
            to,
            subject: `You're invited to join ${workspaceName} on Taskly`,
            html: invitationHtml(workspaceName, acceptUrl),
        });
    } catch (error) {
        console.error("[email] Failed to send invitation email:", error);
    }
};
