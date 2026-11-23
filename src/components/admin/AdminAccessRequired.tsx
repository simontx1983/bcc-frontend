/**
 * AdminAccessRequired — the panel every `/admin/*` screen renders when the
 * server refuses the read with an admin denial (see `isAdminDenial`).
 *
 * No Retry: a permission boundary does not move because the page asked
 * again. The copy names the capability so a staff member who should have
 * access knows what to ask for.
 */

export interface AdminAccessRequiredProps {
  /** Sentence subject, e.g. "The moderation queue". */
  subject: string;
}

export function AdminAccessRequired({ subject }: AdminAccessRequiredProps) {
  return (
    <div className="bcc-panel p-6">
      <p
        className="bcc-mono mb-3 text-bcc-text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        ADMIN ACCESS REQUIRED
      </p>
      <p className="font-serif italic text-bcc-text-secondary">
        {subject} is restricted to platform admins. If you
        should have access, ask an admin to grant your account the
        <code className="bcc-mono mx-1 text-[12px]">manage_options</code>
        capability.
      </p>
    </div>
  );
}
