"use client";

/**
 * ChainHealthBadge — the server's hash-chain check over the validator
 * relationship audit log. `chain_ok` is the server's verdict; this only
 * shows it, with when it was checked and how many rows were covered.
 *
 *   chain_ok true   → "Audit log verified" (status)
 *   chain_ok false  → a warning to stop and escalate (alert)
 *
 * Failed reads stay compact, because the history list beside the badge
 * owns the page-level failure panels: an admin denial renders nothing
 * here (the list shows "Admin access required"), a route the server
 * doesn't have yet says so in one line, and anything else offers Retry.
 */

import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { useValidatorRelationshipHealth } from "@/hooks/useAdminValidators";
import { isAdminDenial, isAdminToolUnavailable } from "@/lib/api/admin-errors";
import type { ValidatorRelationshipHealth } from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";

function CheckedLine({ health }: { health: ValidatorRelationshipHealth }) {
  const when = formatAbsoluteDateTime(health.checked_at);
  return (
    <span className="bcc-mono text-[10px] tracking-[0.12em] text-bcc-text-secondary">
      Checked{" "}
      <time dateTime={health.checked_at}>{when !== "" ? when : health.checked_at}</time>
      {" · "}
      {health.rows_checked} {health.rows_checked === 1 ? "row" : "rows"}
    </span>
  );
}

export function ChainHealthBadge() {
  const query = useValidatorRelationshipHealth();

  if (query.isError && isAdminDenial(query.error)) {
    return null;
  }

  if (query.isPending) {
    return (
      <div>
        <p role="status" className="sr-only">
          Checking the audit log…
        </p>
        <div aria-hidden className={SKELETON_CLASS + " h-12"} />
      </div>
    );
  }

  if (query.isLoadingError) {
    if (isAdminToolUnavailable(query.error)) {
      return (
        <p className="bcc-mono text-[11px] tracking-[0.12em] text-bcc-text-secondary">
          The audit log check isn&apos;t available on the server yet.
        </p>
      );
    }
    return (
      <div className="bcc-panel flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="bcc-mono text-[11px] tracking-[0.12em] text-bcc-text-secondary">
          Couldn&apos;t check the audit log.
        </p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="bcc-btn bcc-btn-outline min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  const health = query.data;

  if (health.chain_ok) {
    return (
      <div
        role="status"
        className="bcc-panel flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--bcc-success)" }}
        />
        <span className="bcc-mono text-[11px] tracking-[0.18em] text-bcc-text">
          AUDIT LOG VERIFIED
        </span>
        <CheckedLine health={health} />
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="bcc-panel flex flex-col gap-2 border-l-4 border-l-bcc-warning px-4 py-3"
    >
      <p className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--bcc-warning)" }}
        />
        <span className="bcc-mono text-[11px] tracking-[0.18em] text-bcc-text">
          AUDIT LOG NEEDS ATTENTION
        </span>
      </p>
      <p className="font-serif text-sm text-bcc-text-secondary">
        The latest check did not confirm the audit log&apos;s integrity. Report it to
        engineering before relying on this history.
      </p>
      <CheckedLine health={health} />
    </div>
  );
}
