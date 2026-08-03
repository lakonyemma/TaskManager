import LegalPage from './LegalPage'

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 3, 2026">
      <p className="legal-intro">
        This Privacy Policy explains how Taskly ("Taskly", "we", "us", or "our") collects, uses, discloses, and
        protects information when you use the Taskly task and team management application (the "Service"). By
        creating an account or otherwise using the Service, you acknowledge that you have read and understood this
        Policy.
      </p>

      <h2>1. Information We Collect</h2>

      <h3>1.1 Information you provide directly</h3>
      <ul>
        <li><strong>Account information:</strong> first name, last name, email address, and a password (stored only as an irreversible hash — we never see or store your password in plain text).</li>
        <li><strong>Profile information:</strong> an optional profile photo, which you may upload from a file or capture with your device's camera.</li>
        <li><strong>Workspace and team content:</strong> workspaces and teams you create or join, member roles, and the email addresses of people you invite.</li>
        <li><strong>Task content:</strong> tasks, descriptions, comments, @mentions, tags, due dates, dependencies, time-tracking entries, saved views, and any files or attachments you upload.</li>
        <li><strong>Communications:</strong> messages you send us for support, and any information you provide when reporting a problem.</li>
      </ul>

      <h3>1.2 Information collected automatically</h3>
      <ul>
        <li><strong>Device and log data:</strong> IP address, browser/device user-agent string, and timestamps, recorded when you sign in or take security-relevant actions.</li>
        <li><strong>Session data:</strong> we keep a record of active login sessions (device/browser and approximate access time) so you can review and revoke them, and to protect your account from unauthorized access.</li>
        <li><strong>Activity logs:</strong> a security and audit trail of actions taken in your workspaces (e.g. task changes, membership changes), including the IP address the action was taken from, used for accountability, debugging, and detecting abuse.</li>
        <li><strong>Push notification data:</strong> if you enable push notifications, your browser generates a push subscription (an endpoint and encryption keys) which we store so we can deliver reminders and alerts to your device.</li>
      </ul>

      <p>
        Taskly does not use cookies for tracking or advertising, and we do not use third-party analytics or
        advertising trackers. Sign-in is handled with access/refresh tokens stored in your browser's local or
        session storage, not cookies.
      </p>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To create and maintain your account and authenticate you.</li>
        <li>To provide the core functionality of the Service — tasks, workspaces, collaboration, notifications, reminders, time tracking, search, and reporting.</li>
        <li>To send transactional emails: email verification, password resets, workspace invitations, due-date reminders, and (if you opt in) daily/weekly digest emails summarizing what's due.</li>
        <li>To send push notifications you've enabled, for task reminders and updates.</li>
        <li>To maintain security: detecting and preventing fraud, abuse, unauthorized access, and to investigate suspicious activity using session and activity-log data.</li>
        <li>To operate optional AI Assistant features (see Section 4 below), when you choose to use them.</li>
        <li>To troubleshoot problems and improve the reliability and usability of the Service.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. Sharing Within Workspaces</h2>
      <p>
        Taskly is a collaboration tool. When you join a workspace, the tasks, comments, files, and activity you and
        your teammates create in that workspace are visible to other members of that workspace, in accordance with
        their role and the workspace's permission settings. Workspace owners and admins can generally see more —
        including membership, settings, and activity logs — than regular members. Consider what you share in a
        shared workspace accordingly.
      </p>

      <h2>4. AI Assistant Features</h2>
      <p>
        Taskly offers optional AI-powered features (such as a daily planner, natural-language task creation, smart
        search, and project summaries). These features are only triggered when you actively use them. When you do,
        the relevant task or workspace text needed to generate a response is sent to <strong>Google's Gemini API</strong> (operated
        by Google LLC) for processing, and the generated result is returned to you within Taskly. We do not send
        your account password, payment information (we don't collect any), or other users' private data beyond what
        is reasonably needed to answer your specific request. Review Google's own privacy terms for how it handles
        data submitted to its API. AI-generated content may be inaccurate or incomplete — always review it before
        relying on it.
      </p>

      <h2>5. Third Parties We Use to Provide the Service</h2>
      <p>We share limited information with the following service providers ("subprocessors"), solely to operate Taskly:</p>
      <ul>
        <li><strong>Email delivery (Brevo):</strong> to send verification, invitation, reminder, and digest emails, we share the recipient's email address and the relevant email content with our email delivery provider, Brevo.</li>
        <li><strong>AI processing (Google Gemini API):</strong> as described in Section 4, only when you use an AI feature.</li>
        <li><strong>File storage (Cloudflare):</strong> uploaded files and profile photos are stored using Cloudflare's object storage infrastructure.</li>
        <li><strong>Web Push delivery:</strong> browser push notifications are delivered via your browser vendor's push service (e.g. Google, Mozilla, Apple), which is inherent to how the Web Push standard works.</li>
      </ul>
      <p>
        We do not sell your personal information, and we do not share it with third parties for their own marketing
        purposes.
      </p>

      <h2>6. Data Retention</h2>
      <p>
        We retain your account and workspace data for as long as your account is active and reasonably necessary to
        provide the Service. Security-related records (session and activity logs) may be retained for a longer
        period as needed to investigate abuse, enforce our Terms, and meet legal obligations. If you request account
        deletion (Section 8), we will delete or anonymize your personal data within a reasonable period, except
        information we are required to retain by law or need to retain for legitimate security or record-keeping
        purposes.
      </p>

      <h2>7. Data Security</h2>
      <p>
        We apply industry-standard safeguards to protect your information, including encrypted password hashing,
        HTTPS in transit, JWT-based authentication with short-lived access tokens and revocable refresh tokens,
        role-based access control, and rate limiting on sensitive endpoints. No method of transmission or storage is
        completely secure, so we cannot guarantee absolute security.
      </p>

      <h2>8. Your Rights and Choices</h2>
      <p>You may, at any time:</p>
      <ul>
        <li>Access and update your account information from within the app's settings.</li>
        <li>Export your task and reporting data (PDF, Excel, or CSV) using the built-in export feature.</li>
        <li>Adjust your notification preferences (push, sound, vibration, email digests) at any time.</li>
        <li>Request a copy of, correction to, or deletion of your personal data by contacting us at the address below.</li>
        <li>Withdraw consent for optional features (such as AI Assistant use or email digests) by simply not using them, or by disabling them in settings.</li>
      </ul>
      <p>
        Depending on where you live, you may have additional rights under applicable data protection law — for
        example, Uganda's Data Protection and Privacy Act, 2019, or (where applicable) the EU/UK GDPR or U.S. state
        privacy laws. We will honor applicable rights requests we receive; contact us and we'll respond within a
        reasonable time.
      </p>

      <h2>9. Children's Privacy</h2>
      <p>
        Taskly is not directed at, and is not intended for use by, children under the age of 16. We do not knowingly
        collect personal information from children under 16. If you believe a child has provided us with personal
        information, please contact us and we will delete it.
      </p>

      <h2>10. International Data Transfers</h2>
      <p>
        Taskly and its service providers may process and store information in countries other than your own. By
        using the Service, you understand your information may be transferred to and processed in such countries,
        which may have different data protection laws than your home country.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If we make material changes, we will notify you by
        email and/or an in-app notice before the changes take effect. Continued use of the Service after changes
        take effect constitutes acceptance of the revised Policy.
      </p>

      <h2>12. Contact Us</h2>
      <p>
        If you have questions about this Privacy Policy or wish to exercise any of your rights, contact us at{' '}
        <a href="mailto:taskly101@gmail.com">taskly101@gmail.com</a>.
      </p>
    </LegalPage>
  )
}
