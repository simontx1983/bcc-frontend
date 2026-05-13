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
import { useGroupMembers } from "@/hooks/useGroupMembers";
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

  return <GroupMembersBody group={group} />;
}

function GroupMembersBody({ group }: { group: GroupDetailResponse }) {
  const [expanded, setExpanded] = useState(false);
  const query = useGroupMembers(group.id);

  if (query.isLoading) {
    return (
      <div className="py-6 text-center">
        <p className="bcc-mono text-cardstock-deep">Loading roster…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="py-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load roster
          {query.error?.message !== undefined ? `: ${query.error.message}` : "."}
        </p>
        <button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
          className="bcc-mono mt-3 text-cardstock-deep underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const items = (query.data?.pages ?? []).flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <div className="bcc-panel mx-auto p-6 text-center">
        <h2 className="bcc-stencil text-2xl text-ink">Empty roster</h2>
        <p className="mt-2 font-serif text-ink-soft">
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

      {expanded && query.hasNextPage && (
        <button
          type="button"
          onClick={() => {
            if (!query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
          disabled={query.isFetchingNextPage}
          className="bcc-stencil mx-auto border border-cardstock-edge/40 px-6 py-2.5 text-cardstock disabled:opacity-50"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more members"}
        </button>
      )}

      {hasMoreToShow && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="bcc-mono mx-auto text-cardstock-deep underline"
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
      className="group flex flex-col items-center gap-2 rounded-sm border border-cardstock-edge/30 bg-cardstock/5 p-3 transition motion-reduce:transition-none hover:border-cardstock-edge/70"
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
          className="bcc-stencil truncate text-cardstock"
          style={{ fontSize: "13px", letterSpacing: "0.04em", maxWidth: "100%" }}
          title={member.display_name}
        >
          {member.display_name}
        </span>
        <span
          className="bcc-mono truncate text-cardstock-deep"
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

