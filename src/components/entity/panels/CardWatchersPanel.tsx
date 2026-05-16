"use client";

/**
 * CardWatchersPanel — entity-profile Watchers tab content.
 *
 * Paginated list of users watching/pulling this entity. Mirrors
 * WatchingPanel's list+grid toggle (same localStorage key shared across
 * roster surfaces — picking GRID on /u sticks for /v too).
 *
 * Unclaimed cards return `pagination.total = 0` from the backend (no
 * graph anchor — see CardWatchersService). The panel renders a
 * tab-specific empty state in that case: "Claim this {kind} to anchor
 * watchers."
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { MembersGrid } from "@/components/members/MembersGrid";
import { useCardWatchers } from "@/hooks/useCardTabs";
import type {
  CardWatchersResponse,
  EntityCardKind,
  MemberSummary,
} from "@/lib/api/types";

interface CardWatchersPanelProps {
  kind: EntityCardKind;
  cardId: number;
  cardName: string;
  isClaimed: boolean;
}

type RosterView = "list" | "grid";

const VIEW_STORAGE_KEY = "bcc:roster-view";

function readStoredView(): RosterView {
  if (typeof window === "undefined") {
    return "list";
  }
  const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return raw === "grid" ? "grid" : "list";
}

export function CardWatchersPanel({
  kind,
  cardId,
  cardName,
  isClaimed,
}: CardWatchersPanelProps) {
  const [view, setView] = useState<RosterView>("list");
  useEffect(() => {
    setView(readStoredView());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const [offset, setOffset] = useState(0);
  const query = useCardWatchers(kind, cardId, offset);
  const [accumulated, setAccumulated] = useState<MemberSummary[]>([]);
  const [seenOffset, setSeenOffset] = useState<number | null>(null);

  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3
          className="bcc-stencil"
          style={{ fontSize: "16px", letterSpacing: "0.18em" }}
        >
          Watchers
        </h3>
        <ViewToggle view={view} onChange={setView} />
      </header>

      <Body
        query={query}
        offset={offset}
        accumulated={accumulated}
        seenOffset={seenOffset}
        view={view}
        cardName={cardName}
        isClaimed={isClaimed}
        onAccumulate={(items, nextSeen) => {
          setAccumulated(items);
          setSeenOffset(nextSeen);
        }}
        onLoadMore={(next) => setOffset(next)}
      />
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Body — splits loading / error / empty / populated branches from the
// shell so the outer component reads as one shape regardless of state.
// ──────────────────────────────────────────────────────────────────────

interface BodyProps {
  query: {
    isPending: boolean;
    isError: boolean;
    error: { message: string } | null;
    data: CardWatchersResponse | undefined;
  };
  offset: number;
  accumulated: MemberSummary[];
  seenOffset: number | null;
  view: RosterView;
  cardName: string;
  isClaimed: boolean;
  onAccumulate: (next: MemberSummary[], seen: number) => void;
  onLoadMore: (nextOffset: number) => void;
}

function Body(props: BodyProps) {
  const { query, offset, accumulated, seenOffset, view, cardName, isClaimed } = props;

  if (query.isError && query.error !== null) {
    return (
      <div className="px-8 py-12">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load watchers: {query.error.message}
        </p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="px-8 py-12">
        <p className="bcc-mono text-ink-soft">Loading watchers…</p>
      </div>
    );
  }

  const page = query.data;
  if (page === undefined) {
    return null;
  }

  if (seenOffset !== offset) {
    const next = offset === 0 ? page.items : [...accumulated, ...page.items];
    props.onAccumulate(next, offset);
  }

  if (accumulated.length === 0) {
    return (
      <EmptyState
        kicker="NO WATCHERS"
        heading={`No one is watching ${cardName} yet.`}
        hint={
          isClaimed
            ? `Watchers light up once members start pulling this card to keep tabs on it.`
            : `${cardName} hasn't been claimed yet — claim anchors the page so members can pull it into their roster.`
        }
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

      {view === "grid" ? (
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
      aria-label="Watcher view"
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
