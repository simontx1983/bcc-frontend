"use client";

/**
 * GroupMembersStrip — the §4.7.7 paginated roster surface on the
 * group-detail page.
 *
 * Two paths driven by `group.members_visible` (server-authoritative
 * per §A2 / §S):
 *
 *   members_visible = false → <GroupGatedNotice variant="roster"/>
 *                             (no fetch — would 403 anyway).
 *   members_visible = true  → useGroupMembers(group.id) → render the
 *                             first 8 members as a horizontal strip
 *                             of avatar tiles + a "VIEW ALL" CTA.
 *
 * The "VIEW ALL N MEMBERS →" affordance currently expands the strip
 * to two rows (16 visible) and continues paginating from there. A
 * dedicated full-page roster route is deferred (PR-3.1 candidate).
 *
 * Secret-group + non-member never reaches this component — the
 * server returns 404 upstream and the page calls Next's `notFound()`.
 */

import { memo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { Avatar } from "@/components/identity/Avatar";
import { GroupGatedNotice } from "@/components/groups/GroupGatedNotice";
import { GROUP_MEMBERS_QUERY_KEY_ROOT, useGroupMembers } from "@/hooks/useGroupMembers";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import {
  shouldWithdrawOnDenial,
  useDenialGate,
  useReportDenial,
} from "@/lib/api/resource-denial";
import { LoadFailure } from "@/components/ui/LoadFailure";
import type { GroupDetailResponse, GroupMember } from "@/lib/api/types";

const PREVIEW_COUNT = 8;

interface GroupMembersStripProps {
  group: GroupDetailResponse;
}

export function GroupMembersStrip({ group }: GroupMembersStripProps) {
  if (!group.members_visible) {
    // Closed-group + non-member case. We don't surface a separate
    // unlock_hint string here because the §4.7.5 detail response
    // doesn't carry one for the roster — the BE's 403 message
    // ("Join the group to see its roster.") only flows through the
    // /members endpoint, which we never call. Use the variant default.
    return <GroupGatedNotice hint={null} variant="roster" />;
  }

  return <GroupMembersGate group={group} />;
}

/** Shown once the server has withdrawn permission to read this roster. */
const ROSTER_WITHDRAWN_COPY = "You can’t see this group’s roster.";

/**
 * The denial gate. Owns no query, so latching it unmounts the body below —
 * which is what makes removing the cache entry safe. See
 * `lib/api/resource-denial`.
 */
function GroupMembersGate({ group }: { group: GroupDetailResponse }) {
  const gate = useDenialGate([...GROUP_MEMBERS_QUERY_KEY_ROOT, group.id]);

  if (gate.withdrawn) {
    return (
      <div className="py-6">
        <LoadFailure message={ROSTER_WITHDRAWN_COPY} />
      </div>
    );
  }

  return <GroupMembersBody group={group} onDenied={gate.withdraw} />;
}

function GroupMembersBody({
  group,
  onDenied,
}: {
  group: GroupDetailResponse;
  onDenied: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const query = useGroupMembers(group.id);

  // A denied REFRESH of the roster already on screen withdraws it. A denied
  // next page does not — it says nothing about the rows already served.
  useReportDenial(
    shouldWithdrawOnDenial(query.error, query.isRefetchError, query.data !== undefined),
    onDenied,
  );

  if (query.isLoading) {
    return (
      <div className="py-6 text-center">
        <p className="bcc-mono text-bcc-text-secondary">Loading roster…</p>
      </div>
    );
  }

  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_unauthorized: "Sign in to see this roster.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "The roster is temporarily unavailable. Try again shortly.",
      // All three denial codes, or the copy falls through to a default
      // ending in "Try again in a moment" — advice withheld with the control.
      bcc_forbidden: "You can’t see this group’s roster.",
      bcc_permission_denied: "You can’t see this group’s roster.",
      bcc_blocked: "You can’t see this group’s roster.",
    },
    "Couldn't load the roster. Try again in a moment.",
  );

  // A permission boundary does not move when the page does, so a Retry
  // against one can only fail the same way: omit `onRetry` and no button
  // renders at all rather than an inert one.
  const denied = isPermissionDenial(query.error);
  const refetchProps = denied ? {} : { onRetry: () => void query.refetch() };
  const nextPageProps = denied
    ? {}
    : { onRetry: () => void query.fetchNextPage() };

  // ONLY a first-load failure may replace the strip. A blanket `isError`
  // was true for all three failures and returned here BEFORE reading
  // `data.pages`, so one failed LOAD MORE threw away a roster that had
  // loaded fine. The other two are handled at the foot of the list.
  if (query.isLoadingError) {
    return (
      <div className="py-6">
        <LoadFailure message={failureCopy} {...refetchProps} />
      </div>
    );
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);

  // "Empty roster" is a claim about the SERVER having no members. A failed
  // read does not support it, so the claim is withheld while in error —
  // the same rule the released panels follow.
  if (items.length === 0 && !query.isError) {
    return (
      <div className="bcc-panel mx-auto p-6 text-center">
        <h2 className="bcc-stencil text-2xl text-bcc-text">Empty roster</h2>
        <p className="mt-2 font-serif text-bcc-text-secondary">
          No active members listed yet.
        </p>
      </div>
    );
  }

  const visible = expanded ? items : items.slice(0, PREVIEW_COUNT);
  const total = query.data?.pages[0]?.pagination.total ?? items.length;
  const hasMoreToShow = !expanded && total > PREVIEW_COUNT;

  return (
    <div className="flex flex-col gap-5">
      <ul
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
      >
        {visible.map((member) => (
          <li key={member.id}>
            <MemberTile member={member} />
          </li>
        ))}
      </ul>

      {/* A failed REFRESH keeps the roster and localises the recovery
          beneath it; the cursor is still coherent so paging stays open. */}
      {query.isRefetchError && <LoadFailure message={failureCopy} {...refetchProps} />}

      {/* Cursor safety: while the NEXT page is failed, LOAD MORE is
          withdrawn so it cannot advance past — and skip — the page that
          failed. Retry re-requests that same page. */}
      {query.isFetchNextPageError ? (
        <LoadFailure message={failureCopy} {...nextPageProps} />
      ) : (
        expanded &&
        query.hasNextPage &&
        !denied && (
          <button
            type="button"
            onClick={() => {
              if (!query.isFetchingNextPage) {
                void query.fetchNextPage();
              }
            }}
            disabled={query.isFetchingNextPage}
            className="bcc-stencil mx-auto border border-bcc-border px-6 py-2.5 text-bcc-text disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more members"}
          </button>
        )
      )}

      {hasMoreToShow && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="bcc-mono mx-auto text-bcc-text-secondary underline"
          style={{ fontSize: "11px", letterSpacing: "0.18em" }}
        >
          VIEW ALL {total.toLocaleString()} MEMBERS →
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MemberTile — single roster cell. Memoized: roster doesn't churn fast
// and the parent re-renders per page-load; shallow-equal `member`
// skips re-renders.
// ──────────────────────────────────────────────────────────────────────

const MemberTile = memo(function MemberTile({ member }: { member: GroupMember }) {
  return (
    <Link
      href={`/u/${member.handle}` as Route}
      className="group flex flex-col items-center gap-2 rounded-sm border border-bcc-border bg-bcc-surface-hover p-3 transition motion-reduce:transition-none hover:border-bcc-border-strong"
    >
      {/*
        Sprint 1 Identity Grammar — consolidated to the shared <Avatar>.
        The previous local Avatar derived a stable per-user HSL hue
        (userId * 47 % 360) for the initials background. That was a
        cohesion-loss but a §A2 / cohesion-grammar win — initial-block
        avatars now match the rest of the app (cardstock-deep ground,
        stencil monogram). Re-introducing per-user hue requires server-
        resolved presentation data, not client-side derivation.
      */}
      <Avatar
        avatarUrl={member.avatar_url !== "" ? member.avatar_url : null}
        handle={member.handle}
        displayName={member.display_name}
        size="md"
        variant="rounded"
      />
      <div className="flex w-full min-w-0 flex-col items-center text-center">
        <span
          className="bcc-stencil truncate text-bcc-text"
          style={{ fontSize: "13px", letterSpacing: "0.04em", maxWidth: "100%" }}
          title={member.display_name}
        >
          {member.display_name}
        </span>
        <span
          className="bcc-mono truncate text-bcc-text-secondary"
          style={{ fontSize: "9px", letterSpacing: "0.14em", maxWidth: "100%" }}
          title={`@${member.handle}`}
        >
          @{member.handle}
        </span>
        {member.role !== "member" && (
          // Server-rendered label per §A2 — render verbatim.
          <span
            className="bcc-mono mt-1 text-safety"
            style={{ fontSize: "9px", letterSpacing: "0.18em" }}
          >
            {member.role_label}
          </span>
        )}
      </div>
    </Link>
  );
});

