"use client";

/**
 * WatchingPanel — §3.1 Watching tab.
 *
 * Two sub-tabs over the PeepSo follow graph:
 *
 *   BEING WATCHED — followers (people who follow this member). Maps
 *                   to PeepSo's `/profile/{handle}/followers/` view.
 *
 *   KEEPING TABS  — following (people this member follows). Maps to
 *                   PeepSo's `/profile/{handle}/followers/following`
 *                   view.
 *
 * Rows render in a compact list shape (avatar + display_name + handle
 * + rank chip) — same `MemberSummary` payload the /members directory
 * uses, just denser. Clicking a row navigates to that user's profile.
 *
 * Privacy: when the target has `watching_hidden` set and the viewer
 * isn't the owner, the endpoint responds 403 `bcc_permission_denied`.
 * We branch on `err.code` to render the "private" empty-state rather
 * than a generic failure (§Phase γ error-doctrine: branch on code,
 * never message).
 *
 * Pagination: simple "Load More" — offset increments by the default
 * page (24 rows) and the accumulated list grows across pages. Total
 * is rendered on the sub-tab strip so the count visible at the top
 * always reflects the full graph size (not just what's loaded).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { MembersGrid } from "@/components/members/MembersGrid";
import { useUserFollowers, useUserFollowing } from "@/hooks/useUserActivity";
import type { BccApiError, MemberSummary, UserFollowsResponse } from "@/lib/api/types";

interface WatchingPanelProps {
  handle: string;
  displayName: string;
}

type WatchingSubTab = "followers" | "following";
type RosterView = "list" | "grid";

const VIEW_STORAGE_KEY = "bcc:roster-view";

/**
 * Persist the view choice across panel mounts + handle navigations.
 * Server-rendered first paint can't read localStorage, so we hydrate
 * the toggle from the default ("list") and overwrite on mount — the
 * brief mismatch is invisible to users with `prefers-reduced-motion`
 * since both renderers are sync.
 */
function readStoredView(): RosterView {
  if (typeof window === "undefined") {
    return "list";
  }
  const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return raw === "grid" ? "grid" : "list";
}

const SUB_TABS: ReadonlyArray<{ key: WatchingSubTab; label: string }> = [
  { key: "followers", label: "Being Watched" },
  { key: "following", label: "Keeping Tabs" },
];

export function WatchingPanel({ handle, displayName }: WatchingPanelProps) {
  const [active, setActive] = useState<WatchingSubTab>("followers");
  // Start with the default ("list") to keep SSR + first-render
  // deterministic; rehydrate from localStorage on mount. The toggle
  // applies to both sub-tabs so a viewer who prefers cards keeps
  // cards as they flip between followers/following.
  const [view, setView] = useState<RosterView>("list");
  useEffect(() => {
    setView(readStoredView());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Roster
        </h3>
        <ViewToggle view={view} onChange={setView} />
      </header>

      <SubTabStrip active={active} onChange={setActive} />

      <div role="tabpanel" id={`watching-subpanel-${active}`}>
        {active === "followers" && (
          <FollowersList handle={handle} displayName={displayName} view={view} />
        )}
        {active === "following" && (
          <FollowingList handle={handle} displayName={displayName} view={view} />
        )}
      </div>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ViewToggle — LIST | GRID switch in the panel header. Mirrors the
// stencil/mono treatment of "+ ADD PHOTO" so the chrome reads the
// same as the sibling panels.
// ──────────────────────────────────────────────────────────────────────

function ViewToggle({
  view,
  onChange,
}: {
  view: RosterView;
  onChange: (next: RosterView) => void;
}) {
  const options: ReadonlyArray<{ key: RosterView; label: string }> = [
    { key: "list", label: "List" },
    { key: "grid", label: "Grid" },
  ];

  return (
    <div
      role="group"
      aria-label="Roster view"
      className="bcc-mono flex items-center gap-1"
      style={{ fontSize: "10px", letterSpacing: "0.18em" }}
    >
      {options.map((opt, i) => {
        const active = view === opt.key;
        return (
          <span key={opt.key} className="flex items-center gap-1">
            {i > 0 && (
              <span aria-hidden className="text-cardstock-deep/60">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(opt.key)}
              aria-pressed={active}
              className={
                "transition-colors " +
                (active ? "text-safety" : "text-cardstock-deep hover:text-cardstock")
              }
            >
              {opt.label.toUpperCase()}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SubTabStrip — mirrors PhotosPanel's strip.
// ──────────────────────────────────────────────────────────────────────

function SubTabStrip({
  active,
  onChange,
}: {
  active: WatchingSubTab;
  onChange: (key: WatchingSubTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Watching sections"
      className="flex flex-wrap gap-x-6 gap-y-2 border-b border-ink/15 px-5 py-2"
    >
      {SUB_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`watching-subtab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`watching-subpanel-${tab.key}`}
            onClick={() => onChange(tab.key)}
            className={
              "bcc-mono pb-1 transition-colors border-b-2 " +
              (isActive
                ? "text-ink border-safety"
                : "text-ink-soft border-transparent hover:text-ink")
            }
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            {tab.label.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// FollowersList / FollowingList — thin wrappers around RosterList that
// pin the right hook + the right empty-state copy.
// ──────────────────────────────────────────────────────────────────────

function FollowersList({
  handle,
  displayName,
  view,
}: {
  handle: string;
  displayName: string;
  view: RosterView;
}) {
  const [offset, setOffset] = useState(0);
  const query = useUserFollowers(handle, offset);
  return (
    <RosterList
      query={query}
      offset={offset}
      view={view}
      onLoadMore={(next) => setOffset(next)}
      emptyKicker="NO WATCHERS"
      emptyHeading="Nobody is watching yet."
      emptyHint={`${displayName} hasn't picked up watchers yet — the followers list grows when other members start tracking them.`}
      privateHeading={`${displayName} keeps their watchers private.`}
    />
  );
}

function FollowingList({
  handle,
  displayName,
  view,
}: {
  handle: string;
  displayName: string;
  view: RosterView;
}) {
  const [offset, setOffset] = useState(0);
  const query = useUserFollowing(handle, offset);
  return (
    <RosterList
      query={query}
      offset={offset}
      view={view}
      onLoadMore={(next) => setOffset(next)}
      emptyKicker="NO ONE ON FILE"
      emptyHeading={`${displayName} isn't keeping tabs on anyone.`}
      emptyHint="When this member follows somebody on the floor, that person shows up here."
      privateHeading={`${displayName} keeps their watching list private.`}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// RosterList — paginated MemberSummary list with three empty branches
// (loading / privacy-denied / no-data) and a Load More CTA.
// ──────────────────────────────────────────────────────────────────────

interface RosterListProps {
  query: {
    isPending: boolean;
    isError: boolean;
    error: BccApiError | null;
    data: UserFollowsResponse | undefined;
  };
  offset: number;
  view: RosterView;
  onLoadMore: (nextOffset: number) => void;
  emptyKicker: string;
  emptyHeading: string;
  emptyHint: string;
  privateHeading: string;
}

function RosterList(props: RosterListProps) {
  // useState-cached accumulator: each Load More appends the new page
  // to `accumulated`. Resetting offset to 0 (e.g. sub-tab switch) is
  // handled by the wrapper re-mounting this component, so we don't
  // need to track the reset boundary here.
  const [accumulated, setAccumulated] = useState<MemberSummary[]>([]);
  const [seenOffset, setSeenOffset] = useState<number | null>(null);

  const { query, offset } = props;
  const queryError = query.error;

  // Privacy branch — 403 bcc_permission_denied means the target has
  // watching_hidden on. Render the private empty-state, not a failure.
  if (query.isError && queryError !== null && queryError.code === "bcc_permission_denied") {
    return (
      <EmptyState
        kicker="PRIVATE"
        heading={props.privateHeading}
        hint="This is a per-member setting — the owner controls visibility from their profile preferences."
      />
    );
  }

  if (query.isError && queryError !== null) {
    return (
      <div className="px-8 py-12">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load this list: {queryError.message}
        </p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="px-8 py-12">
        <p className="bcc-mono text-ink-soft">Loading…</p>
      </div>
    );
  }

  const page = query.data;
  if (page === undefined) {
    return null;
  }

  // Append-on-paginate: capture each page's items once and accumulate.
  // Cheaper than a useEffect for an interactive Load More that drives
  // the offset deterministically.
  if (seenOffset !== offset) {
    if (offset === 0) {
      setAccumulated(page.items);
    } else {
      setAccumulated((prev) => [...prev, ...page.items]);
    }
    setSeenOffset(offset);
  }

  if (accumulated.length === 0) {
    return (
      <EmptyState
        kicker={props.emptyKicker}
        heading={props.emptyHeading}
        hint={props.emptyHint}
      />
    );
  }

  const hasMore = page.pagination.has_more;
  const nextOffset = page.pagination.offset + page.items.length;

  return (
    <div className="px-5 py-5">
      <p
        className="bcc-mono mb-3 text-ink-soft"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {page.pagination.total} ON FILE
      </p>

      {props.view === "grid" ? (
        // Grid view reuses the /members directory's FlippableMemberCard
        // so the roster reads as a slice of that surface. Same flip
        // mechanic, same trust-dossier back face — no parallel card
        // implementation.
        <MembersGrid items={accumulated} />
      ) : (
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {accumulated.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => props.onLoadMore(nextOffset)}
            className="bcc-mono border border-ink/30 bg-cardstock px-4 py-2 text-ink"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            LOAD MORE
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// MemberRow — compact roster row: avatar + display_name + handle on
// the left, rank chip on the right. Whole row clickable to /u/{handle}.
// ──────────────────────────────────────────────────────────────────────

function MemberRow({ member }: { member: MemberSummary }) {
  const href = `/u/${member.handle}` as Route;
  const initial =
    member.display_name !== "" ? member.display_name.charAt(0).toUpperCase() : "·";

  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 py-3 transition-colors hover:bg-ink/[0.03]"
        aria-label={`Open ${member.display_name}'s profile`}
      >
        <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/20 bg-cardstock-deep">
          {member.avatar_url !== "" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span
              className="bcc-stencil text-ink/60"
              style={{ fontSize: "16px" }}
              aria-hidden
            >
              {initial}
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="bcc-stencil block truncate text-ink" style={{ fontSize: "16px" }}>
            {member.display_name}
          </span>
          <span
            className="bcc-mono block truncate text-ink-soft"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            @{member.handle.toUpperCase()}
          </span>
        </span>

        {member.rank_label !== "" && (
          <span
            className="bcc-mono shrink-0 border border-ink/30 bg-cardstock px-2 py-0.5 text-ink"
            style={{ fontSize: "9px", letterSpacing: "0.18em" }}
            aria-label={`Rank: ${member.rank_label}`}
          >
            {member.rank_label.toUpperCase()}
          </span>
        )}
      </Link>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────────
// EmptyState — shared empty / privacy frame, matches the rest of the
// brutalist empty states in this file.
// ──────────────────────────────────────────────────────────────────────

function EmptyState({
  kicker,
  heading,
  hint,
}: {
  kicker: string;
  heading: string;
  hint: string;
}) {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {kicker}
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        {heading}
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        {hint}
      </p>
    </div>
  );
}