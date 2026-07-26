import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;
const EMAIL_FROM = process.env.EMAIL_FROM || "Taskly <onboarding@resend.dev>";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

if (!resend) {
    console.warn("[email] RESEND_API_KEY is not set — emails will be logged to the console instead of sent.");
}

// Shared branded shell so every transactional email (invitations, email
// verification, future notifications) looks consistent without duplicating
// the outer markup in each template.
const emailShell = (eyebrow: string, heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string, footnote: string) => `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#060B23;padding:32px;color:#f8fafc">
    <div style="max-width:480px;margin:0 auto;background:rgba(255,255,255,0.05);border:1px solid rgba(139,92,246,0.3);border-radius:16px;padding:32px">
      <p style="letter-spacing:2px;text-transform:uppercase;font-size:12px;color:#c084fc;margin:0 0 12px">${eyebrow}</p>
      <h1 style="font-size:22px;margin:0 0 12px">${heading}</h1>
      <p style="color:#cbd5e1;line-height:1.6;margin:0 0 24px">${bodyHtml}</p>
      <a href="${ctaUrl}"
        style="display:inline-block;background:linear-gradient(135deg,#8B5CF6,#A855F7);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">
        ${ctaLabel}
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:24px">${footnote}</p>
    </div>
  </div>
`;

const sendOrLog = async (to: string, subject: string, html: string, logLabel: string, linkForLog: string) => {
    if (!resend) {
        console.log("═══════════════════════════════════════════");
        console.log("[EMAIL] (dev mode, no RESEND_API_KEY) To:", to);
        console.log("[EMAIL] Subject:", subject);
        console.log(`[EMAIL] ${logLabel}:`, linkForLog);
        console.log("═══════════════════════════════════════════");
        return;
    }

    try {
        await resend.emails.send({ from: EMAIL_FROM, to, subject, html });
    } catch (error) {
        console.error(`[email] Failed to send ${logLabel.toLowerCase()} email:`, error);
    }
};

export const sendInvitationEmail = async (
    to: string,
    workspaceName: string,
    token: string,
): Promise<void> => {
    const acceptUrl = `${APP_URL}/register?invite=${token}`;
    const html = emailShell(
        "Taskly",
        "You've been invited",
        `You've been invited to join the <strong>${workspaceName}</strong> workspace on Taskly. Accept the invitation to start collaborating with your team.`,
        "Accept invitation",
        acceptUrl,
        `If the button doesn't work, copy this link: ${acceptUrl}`,
    );
    await sendOrLog(to, `You're invited to join ${workspaceName} on Taskly`, html, "Accept link", acceptUrl);
};

export const sendVerificationEmail = async (
    to: string,
    firstname: string,
    token: string,
): Promise<void> => {
    const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
    const html = emailShell(
        "Taskly",
        "Verify your email",
        `Hi ${firstname}, thanks for signing up for Taskly. Confirm this is your email address to activate your account. This link expires in 24 hours.`,
        "Verify email",
        verifyUrl,
        `If the button doesn't work, copy this link: ${verifyUrl}`,
    );
    await sendOrLog(to, "Verify your email for Taskly", html, "Verify link", verifyUrl);
};
