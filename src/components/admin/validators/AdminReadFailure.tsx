/**
 * AdminReadFailure — the failed-read states shared by the validator admin
 * screens.
 *
 *   - admin denial (403)              → <AdminAccessRequired>, no Retry
 *   - route not on the server (404 rest_no_route) → "not available yet", no Retry
 *   - an unknown id filter (404 bcc_not_found)    → "No page or member matches that id.", no Retry
 *   - anything else (503, 429, …)     → LoadFailure with a real Retry
 *
 * §γ: copy is keyed on `err.code` (and a 503 on its status); the
 * server's message never renders.
 */

import { AdminAccessRequired } from "@/components/admin/AdminAccessRequired";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { isAdminDenial, isAdminIdNotFound, isAdminToolUnavailable } from "@/lib/api/admin-errors";
import { humanizeCode, isServiceUnavailable } from "@/lib/api/errors";

/** The read-failure sentence for `subject` ("The validator directory"). */
export function adminReadFailureCopy(error: unknown, subject: string): string {
  const object = subject.charAt(0).toLowerCase() + subject.slice(1);
  if (isServiceUnavailable(error)) {
    return `${subject} is temporarily unavailable. Try again shortly.`;
  }
  return humanizeCode(
    error,
    {
      bcc_unauthorized: `Sign in again to view ${object}.`,
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_invalid_request: "The server didn't accept these filters. Change them and try again.",
    },
    `Couldn't load ${object}. Try again in a moment.`,
  );
}

/** An id filter that matches nothing (`bcc_not_found`). */
export const ADMIN_ID_NOT_FOUND_COPY = "No page or member matches that id.";

/**
 * A route this server doesn't have yet (`rest_no_route`). Reads show it
 * as a panel; writes and the user search show it as their error line,
 * since a Retry against a missing route can't help.
 */
export const ADMIN_TOOL_UNAVAILABLE_COPY = "This tool isn't available on the server yet.";

function AdminToolUnavailable() {
  return (
    <div className="bcc-panel p-6">
      <p
        className="bcc-mono mb-3 text-bcc-text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NOT AVAILABLE YET
      </p>
      <p className="font-serif italic text-bcc-text-secondary">{ADMIN_TOOL_UNAVAILABLE_COPY}</p>
    </div>
  );
}

export interface AdminReadFailureProps {
  error: unknown;
  /** Sentence subject, e.g. "The validator directory". */
  subject: string;
  onRetry: () => void;
}

export function AdminReadFailure({ error, subject, onRetry }: AdminReadFailureProps) {
  if (isAdminDenial(error)) {
    return <AdminAccessRequired subject={subject} />;
  }
  if (isAdminToolUnavailable(error)) {
    return <AdminToolUnavailable />;
  }
  if (isAdminIdNotFound(error)) {
    return (
      <div className="bcc-panel p-6">
        <p className="font-serif text-bcc-text-secondary">{ADMIN_ID_NOT_FOUND_COPY}</p>
      </div>
    );
  }
  return (
    <div className="bcc-panel">
      <LoadFailure message={adminReadFailureCopy(error, subject)} onRetry={onRetry} />
    </div>
  );
}
