import LegalPage from './LegalPage'

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 12, 2026">
      <p className="legal-intro">
        This Privacy Policy explains how Taskly ("Taskly", "we", "us", or "our") collects, uses, discloses, and protects information when you use the Taskly task and team management application (the "Service"). By creating an account or otherwise using the Service, you acknowledge that you have read and understood this Policy.
      </p>

      <h2>1. Information We Collect</h2>
      <h3>1.1 Information you provide directly</h3>
      <ul>
        <li><strong>Account information:</strong> first name, last name, email address, and a password stored only as an irreversible hash.</li>
        <li><strong>Profile information:</strong> an optional profile photo and profile preferences.</li>
        <li><strong>Workspace and team content:</strong> workspaces and teams you create or join, member roles, and invitations.</li>
        <li><strong>Task content:</strong> tasks, descriptions, comments, mentions, tags, due dates, dependencies, time entries, saved views, and uploaded files.</li>
        <li><strong>Communications:</strong> information you provide when contacting support or reporting a problem.</li>
      </ul>

      <h3>1.2 Information collected automatically</h3>
      <ul>
        <li><strong>Device and log data:</strong> IP address, browser/device user-agent string, timestamps, runtime errors, and performance measurements used for security and reliability.</li>
        <li><strong>Session data:</strong> active login sessions so you can review and revoke them.</li>
        <li><strong>Activity logs:</strong> an audit trail of workspace and security actions.</li>
        <li><strong>Push notification data:</strong> the browser-generated endpoint and encryption keys needed to deliver reminders and alerts.</li>
      </ul>

      <h3>1.3 Optional Google Gmail connection</h3>
      <p>
        If you choose to connect Gmail to Taskly's Personal Action Inbox, Taskly requests the Google Gmail <strong>read-only</strong> permission. Taskly uses that permission to identify messages that appear to require action, contain a deadline, or represent a sent conversation that may need a follow-up. Taskly does not request Gmail permission to send, delete, archive, label, or otherwise modify your messages.
      </p>
      <ul>
        <li>Taskly stores an encrypted Google authorization token so background monitoring can continue after the initial connection.</li>
        <li>Taskly stores only limited mail-action metadata needed for the feature, such as Gmail message/thread identifiers, sender or recipient, subject, snippet, received time, detected deadline, and action status. Taskly does not intentionally store full message bodies or attachments for this feature.</li>
        <li>Gmail-derived information remains personal to the connected Taskly user. It is not visible to workspace teammates unless you explicitly convert an email into a shared Taskly task or follow-up.</li>
        <li>Disconnecting Gmail removes Taskly's stored Gmail connection tokens and stored mail-action metadata. It does not delete or modify messages in Gmail.</li>
      </ul>
      <p>
        Taskly's use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. Google user data is not used for advertising and is not sold.
      </p>

      <p>Taskly does not use cookies for advertising or third-party advertising trackers. Sign-in uses access and refresh tokens stored in browser local or session storage.</p>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>To create and maintain your account and authenticate you.</li>
        <li>To provide tasks, workspaces, collaboration, notifications, reminders, time tracking, search, reporting, execution planning, and offline synchronization.</li>
        <li>To send transactional emails such as verification, password resets, invitations, reminders, and opted-in digests.</li>
        <li>To deliver push notifications you have enabled.</li>
        <li>When you connect Gmail, to build your private Personal Action Inbox, detect possible deadlines and action requests, identify sent threads awaiting replies, and create Taskly tasks or Waiting For items only when you request that action.</li>
        <li>To maintain security and investigate abuse or unauthorized access.</li>
        <li>To operate optional AI Assistant features described below.</li>
        <li>To troubleshoot problems and improve reliability and usability.</li>
        <li>To comply with legal obligations.</li>
      </ul>

      <h2>3. Sharing Within Workspaces</h2>
      <p>
        Taskly is a collaboration tool. Content you deliberately place in a shared workspace may be visible to other members according to their role. Gmail connection data and Personal Action Inbox items are private to you and do not become workspace content unless you explicitly create a Taskly task or follow-up from them.
      </p>

      <h2>4. AI Assistant Features</h2>
      <p>
        Taskly offers optional AI-powered features such as planning, natural-language task creation, smart search, and summaries. When you use such a feature, the relevant text needed to generate a response may be sent to <strong>Google's Gemini API</strong> for processing. AI-generated content may be inaccurate or incomplete, so review it before relying on it.
      </p>

      <h2>5. Third Parties We Use to Provide the Service</h2>
      <p>We share limited information with service providers solely to operate Taskly:</p>
      <ul>
        <li><strong>Google Gmail API:</strong> only when you connect Gmail, to read the mailbox metadata/content necessary to provide the Personal Action Inbox using the read-only scope you approve.</li>
        <li><strong>Email delivery (Brevo):</strong> to send Taskly transactional and opted-in digest emails.</li>
        <li><strong>AI processing (Google Gemini API):</strong> only when you use an AI feature.</li>
        <li><strong>File storage (Cloudflare):</strong> for uploaded files and profile photos.</li>
        <li><strong>Web Push delivery:</strong> through your browser vendor's push service.</li>
      </ul>
      <p>We do not sell personal information and do not share it with third parties for their own marketing purposes.</p>

      <h2>6. Data Retention</h2>
      <p>
        We retain account and workspace data while your account is active and as reasonably necessary to provide the Service. Gmail authorization data and Personal Action Inbox metadata are retained only while needed for the connected feature and are removed when you disconnect Gmail through Taskly. Security records may be retained longer where reasonably required for abuse prevention, legal obligations, or record keeping.
      </p>

      <h2>7. Data Security</h2>
      <p>
        We use safeguards including password hashing, HTTPS in transit, short-lived access tokens, revocable refresh sessions, role-based access control, rate limiting, and authenticated encryption for stored Gmail OAuth tokens. No transmission or storage method is completely secure, so absolute security cannot be guaranteed.
      </p>

      <h2>8. Your Rights and Choices</h2>
      <p>You may, at any time:</p>
      <ul>
        <li>Access and update your account information.</li>
        <li>Export supported Taskly task and reporting data.</li>
        <li>Adjust notification preferences.</li>
        <li>Enable or disable Gmail monitoring and the Daily Mail Brief.</li>
        <li>Disconnect Gmail, which revokes Taskly's stored connection and removes Taskly's stored mail-action metadata.</li>
        <li>Request access, correction, or deletion of personal data by contacting us.</li>
      </ul>
      <p>
        Depending on where you live, additional rights may apply under laws such as Uganda's Data Protection and Privacy Act, 2019, the EU/UK GDPR, or applicable U.S. state privacy laws.
      </p>

      <h2>9. Children's Privacy</h2>
      <p>Taskly is not directed at children under 16 and we do not knowingly collect personal information from children under 16.</p>

      <h2>10. International Data Transfers</h2>
      <p>Taskly and its service providers may process and store information in countries other than your own, subject to applicable safeguards and law.</p>

      <h2>11. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. Material changes may be communicated by email and/or an in-app notice before taking effect.</p>

      <h2>12. Contact Us</h2>
      <p>If you have questions about this Privacy Policy or wish to exercise your rights, contact <a href="mailto:taskly101@gmail.com">taskly101@gmail.com</a>.</p>
    </LegalPage>
  )
}
