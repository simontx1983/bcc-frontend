"use client";

/**
 * AccountActivitySection — in-app half of the §J / Track-F security
 * trail. Paginated timeline of credential-class events on the user's
 * own account, cross-channel redundant with AccountSecurityMailer.
 *
 * Visual posture (mirrors AttestationRoster):
 *   - Equal row treatment. NOT a leaderboard, not a feed.
 *   - No spinner during initial fetch — empty + loading + zero-rows
 *     all collapse to the same EmptyState. Avoids state flicker on
 *     a security-sensitive surface.
 *   - Action labels are FE-local copy keyed off the stable `action`
 *     code per Phase γ. Unknown actions render the raw code so a
 *     future server-side addition surfaces rather than silently
 *     dropping.
 *
 * Pagination: explicit "OLDER →" / "← NEWER" buttons. No infinite
 * scroll — security-sensitive surface, prefer deliberate paging.
 */

import { useState } from "react";

import { useAccountActivity } from "@/hooks/useAccount";
import type { AccountActivityItem } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

/**
 * Stable-code → user-facing label map. Mirrors the AccountSecurityMailer
 * email subjects so the in-app timeline reads as a 1:1 ledger of what
 * the user received out-of-band.
 *
 * MUST stay in lockstep with the §4.23 backend allowlist
 * (`MyAccountActivityEndpoint::USER_FACING_ACTIONS`). If the backend
 * broadens the allowlist, this map MUST be extended in the same change
 * — unknown codes render the raw `action` string as a fallback (visible
 * to engineers + users, not silently dropped), but that's a stopgap not
 * a coverage policy.
 */
const ACCOUNT_ACTIVITY_LABELS: Record<string, string> = {
  account_email_changed: "Email changed",
  account_password_changed: "Password changed",
  account_deleted: "Account deletion requested",
  wallet_linked: "Wallet linked",
  wallet_unlinked: "Wallet unlinked",
  sessions_revoked_all: "Signed out of all devices",
};

export function AccountActivitySection() {
  const [page, setPage] = useState(1);
  const { data, isPending } = useAccountActivity(page);

  // Initial-fetch flicker guard: rendering EmptyState during the first
  // round trip would briefly tell a user with N events that they have
  // zero — misleading on a security surface where the user may be
  // verifying an email alert in real time. `placeholderData:
  // keepPreviousData` already prevents the flicker on subsequent
  // pages; this guard handles only the cold-start case.
  if (isPending) {
    return null;
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 0;
  const total = data?.total ?? 0;

  if (items.length === 0 && page === 1) {
    return <EmptyState />;
  }

  return (
    <section
      aria-label="Account security activity"
      className="bcc-panel p-5"
    >
      <ul className="flex flex-col">
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} />
        ))}
      </ul>

      {totalPages > 1 && (
        <nav
          aria-label="Activity pagination"
          className="bcc-mono mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-bcc-border pt-3 text-[10px] tracking-[0.18em] text-bcc-text-secondary"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border border-bcc-border/30 px-3 py-1 text-bcc-text transition hover:bg-bcc-surface-hover disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            ← NEWER
          </button>
          <span>
            PAGE {page} / {totalPages} · {total} EVENTS
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="border border-bcc-border/30 px-3 py-1 text-bcc-text transition hover:bg-bcc-surface-hover disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            OLDER →
          </button>
        </nav>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <section className="bcc-panel p-5">
      <p className="font-serif italic text-bcc-text-secondary">
        No security events recorded yet. Activity here when you change
        your email, password, or wallet links.
      </p>
    </section>
  );
}

function ActivityRow({ item }: { item: AccountActivityItem }) {
  const label = ACCOUNT_ACTIVITY_LABELS[item.action] ?? item.action;
  const ip = item.ip_masked;

  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-bcc-border py-3 last:border-b-0">
      <span className="bcc-stencil text-bcc-text">{label}</span>
      <div className="bcc-mono flex flex-wrap items-baseline gap-x-2 text-[10px] tracking-[0.18em] text-bcc-text-secondary">
        <time dateTime={toIsoDateTime(item.created_at)}>
          {formatRelativeTime(item.created_at)}
        </time>
        {ip !== "" && (
          <>
            <span aria-hidden>·</span>
            <span>FROM {ip}</span>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Normalize MySQL UTC datetime (`YYYY-MM-DD HH:MM:SS`) to ISO so the
 * `dateTime` attribute is HTML-spec-conforming. Mirrors the helper in
 * EndorsementsGivenView (kept local — single line, no shared utility
 * to import). `formatRelativeTime` already normalizes the human-
 * readable label internally.
 */
function toIsoDateTime(input: string): string {
  return input.includes("T") || input.includes("Z")
    ? input
    : input.replace(" ", "T") + "Z";
}
