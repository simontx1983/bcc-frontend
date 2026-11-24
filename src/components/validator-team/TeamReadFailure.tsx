/**
 * TeamReadFailure — what a failed team read renders (the team screen, the
 * permissions page, my invites).
 *
 *   - 403 (`bcc_forbidden` / `rest_forbidden`) → the caller's no-access line, no Retry
 *   - 404 `rest_no_route` → "This isn't available on the server yet.", no Retry
 *   - 404 `bcc_not_found` → "This page or team wasn't found.", no Retry
 *   - anything else (503, 429, a network failure) → LoadFailure with a real Retry
 *
 * A Retry that can't succeed is a lie, so the first three get none. §γ:
 * copy is keyed on the code (and a 503 on its status), never the
 * server's message.
 */

import { TEAM_ERROR_COPY } from "@/components/validator-team/team-copy";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { isAdminDenial, isAdminToolUnavailable } from "@/lib/api/admin-errors";
import { humanizeCode, isCode, isServiceUnavailable } from "@/lib/api/errors";

export interface TeamReadFailureProps {
  error: unknown;
  /** The retryable line, e.g. "Your team's permissions couldn't be read just now." */
  unavailable: string;
  /** What a 403 says. Defaults to "You don't have access to this team." */
  forbidden?: string;
  onRetry: () => void;
}

function Notice({ eyebrow, text }: { eyebrow: string; text: string }) {
  return (
    <div className="bcc-panel p-6">
      <p className="bcc-mono mb-3 text-[10px] tracking-[0.24em] text-bcc-text-safety">{eyebrow}</p>
      <p className="font-serif italic text-bcc-text-secondary">{text}</p>
    </div>
  );
}

export function TeamReadFailure({
  error,
  unavailable,
  forbidden = TEAM_ERROR_COPY.forbidden,
  onRetry,
}: TeamReadFailureProps) {
  if (isAdminDenial(error)) return <Notice eyebrow="NO ACCESS" text={forbidden} />;
  if (isAdminToolUnavailable(error)) {
    return <Notice eyebrow="NOT AVAILABLE YET" text={TEAM_ERROR_COPY.notOnServer} />;
  }
  if (isCode(error, "bcc_not_found")) return <Notice eyebrow="NOT FOUND" text={TEAM_ERROR_COPY.notFound} />;

  const message = isServiceUnavailable(error)
    ? `${unavailable} Try again shortly.`
    : humanizeCode(
        error,
        {
          bcc_unauthorized: "Your session has ended. Sign in again to see this.",
          bcc_rate_limited: "Loading too fast — give it a moment and try again.",
        },
        `${unavailable} Try again in a moment.`,
      );
  return (
    <div className="bcc-panel">
      <LoadFailure message={message} onRetry={onRetry} />
    </div>
  );
}
