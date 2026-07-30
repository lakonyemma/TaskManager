// Gmail SMTP (Nodemailer) doesn't work from most PaaS hosts (Render included)
// — they block outbound SMTP ports to prevent abuse, so the connection just
// times out rather than failing fast. Brevo's transactional email API sends
// over HTTPS instead, which isn't blocked — plain fetch(), no SDK needed.
// Unlike Resend's sandbox mode, Brevo doesn't restrict the recipient to the
// account owner's own address once a single sender email is verified.
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Taskly <onboarding@taskly.app>";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

if (!BREVO_API_KEY) {
    console.warn("[email] BREVO_API_KEY is not set — emails will be logged to the console instead of sent.");
}

// EMAIL_FROM is the same "Name <email>" string format used across every
// provider this project has run on — Brevo's API wants them as separate
// fields, so split it here instead of introducing yet another env var shape.
const parseSender = (from: string): { name?: string; email: string } => {
    const match = from.match(/^(.*?)\s*<(.+)>$/);
    if (match) return { name: match[1].trim() || undefined, email: match[2].trim() };
    return { email: from.trim() };
};

// Shared branded shell so every transactional email looks consistent
// without duplicating the outer markup in each template. Table-based
// layout for email-client compatibility (Outlook/Gmail strip a lot of
// modern CSS); a prefers-color-scheme block lets dark-mode clients render
// a darker card instead of clipping the app's own dark theme onto a white
// client chrome.
const emailShell = (eyebrow: string, heading: string, bodyHtml: string, ctaLabel: string, ctaUrl: string, footnote: string) => `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${heading}</title>
    <style>
      @media (prefers-color-scheme: dark) {
        .tm-bg { background: #05070f !important; }
        .tm-card { background: rgba(255,255,255,0.06) !important; }
      }
    </style>
  </head>
  <body class="tm-bg" style="margin:0;padding:0;background:#060B23;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060B23;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" class="tm-card"
            style="max-width:480px;width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(139,92,246,0.3);border-radius:16px;">
            <tr>
              <td style="padding:32px;">
                <p style="letter-spacing:2px;text-transform:uppercase;font-size:12px;color:#c084fc;margin:0 0 12px;font-weight:600;">${eyebrow}</p>
                <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px;color:#f8fafc;">${heading}</h1>
                <p style="color:#cbd5e1;line-height:1.6;margin:0 0 24px;font-size:15px;">${bodyHtml}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#8B5CF6,#A855F7);">
                      <a href="${ctaUrl}"
                        style="display:inline-block;color:#ffffff;text-decoration:none;padding:12px 24px;font-weight:600;font-size:14px;">
                        ${ctaLabel}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="color:#64748b;font-size:12px;margin-top:24px;word-break:break-all;">${footnote}</p>
              </td>
            </tr>
          </table>
          <p style="color:#475569;font-size:11px;margin-top:20px;">Taskly &mdash; task management for teams that move fast.</p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

const sendMail = async (to: string, subject: string, html: string, logLabel: string, linkForLog: string) => {
    if (!BREVO_API_KEY) {
        console.log("═══════════════════════════════════════════");
        console.log("[EMAIL] (dev mode, BREVO_API_KEY not set) To:", to);
        console.log("[EMAIL] Subject:", subject);
        console.log(`[EMAIL] ${logLabel}:`, linkForLog);
        console.log("═══════════════════════════════════════════");
        return;
    }

    try {
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "api-key": BREVO_API_KEY,
                "content-type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify({
                sender: parseSender(EMAIL_FROM),
                to: [{ email: to }],
                subject,
                htmlContent: html,
            }),
        });
        // Brevo returns a non-2xx status with a JSON error body for API-level
        // failures (unverified sender, bad recipient, rate limit, etc.)
        // rather than throwing — fetch() only rejects on network failure.
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.error(`[email] Brevo rejected the ${logLabel.toLowerCase()} email to ${to}: ${res.status} ${body}`);
        }
    } catch (error) {
        console.error(`[email] Failed to send ${logLabel.toLowerCase()} email:`, error);
    }
};

export const sendVerificationEmail = async (to: string, firstname: string, token: string): Promise<void> => {
    const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
    const html = emailShell(
        "Taskly",
        `Verify your email, ${firstname}`,
        `Thanks for signing up for Taskly! Confirm this is your email address to activate your account. This link expires in 24 hours.`,
        "Verify email",
        verifyUrl,
        `If the button doesn't work, copy this link: ${verifyUrl}`,
    );
    await sendMail(to, "Verify your email for Taskly", html, "Verification link", verifyUrl);
};

export const sendVerificationSuccessEmail = async (to: string, firstname: string): Promise<void> => {
    const loginUrl = `${APP_URL}/login`;
    const html = emailShell(
        "Taskly",
        `You're all set, ${firstname}`,
        `Your email address is verified and your Taskly account is now active. Sign in to start organizing your work.`,
        "Sign in",
        loginUrl,
        `If the button doesn't work, copy this link: ${loginUrl}`,
    );
    await sendMail(to, "Your Taskly account is verified", html, "Login link", loginUrl);
};

export const sendInvitationEmail = async (
    to: string,
    workspaceName: string,
    token: string,
    inviterName?: string,
    role?: string,
    expiresAt?: Date,
): Promise<void> => {
    const acceptUrl = `${APP_URL}/invite/${token}`;
    const expiryLine = expiresAt ? ` This invitation expires on ${expiresAt.toLocaleDateString()}.` : "";
    const inviterLine = inviterName ? `${inviterName} invited you` : "You've been invited";
    const roleLine = role ? ` as a <strong>${role.toLowerCase()}</strong>` : "";
    const html = emailShell(
        "Taskly",
        "You've been invited",
        `${inviterLine} to join the <strong>${workspaceName}</strong> workspace on Taskly${roleLine}. Accept the invitation to start collaborating with your team.${expiryLine}`,
        "Accept invitation",
        acceptUrl,
        `If the button doesn't work, copy this link: ${acceptUrl}`,
    );
    await sendMail(to, `You're invited to join ${workspaceName} on Taskly`, html, "Accept link", acceptUrl);
};

export const sendInvitationAcceptedEmail = async (
    to: string,
    inviterName: string,
    accepterName: string,
    workspaceName: string,
): Promise<void> => {
    const workspaceUrl = `${APP_URL}/app`;
    const html = emailShell(
        "Taskly",
        `${accepterName} joined ${workspaceName}`,
        `Hi ${inviterName}, ${accepterName} accepted your invitation and is now a member of the <strong>${workspaceName}</strong> workspace.`,
        "Open Taskly",
        workspaceUrl,
        `If the button doesn't work, copy this link: ${workspaceUrl}`,
    );
    await sendMail(to, `${accepterName} joined ${workspaceName} on Taskly`, html, "Workspace link", workspaceUrl);
};
