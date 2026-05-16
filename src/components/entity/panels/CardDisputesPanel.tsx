"use client";

/**
 * CardDisputesPanel — entity-profile Disputes tab content.
 *
 * Paginated list of open disputes filed against the entity. V1 surfaces
 * only `status=0` rows (resolved + dismissed are intentionally hidden
 * from the entity profile — see CardDisputesService).
 *
 * Each row shows:
 *   - OPEN status pill (dispute-red on cardstock)
 *   - Flagger MemberRow (the user who opened the dispute)
 *   - Dispute body
 *   - Posted-at relative label
 *
 * Mirrors CardReviewsPanel exactly; differs only in which hook it
 * calls and the GradePill → OpenPill swap.
 */

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { useCardDisputes } from "@/hooks/useCardTabs";
import type {
  CardDispute,
  EntityCardKind,
  MemberSummary,
} from "@/lib/api/types";

interface CardDisputesPanelProps {
  kind: EntityCardKind;
  cardId: number;
  cardName: string;
}

export function CardDisputesPanel({ kind, cardId, cardName }: CardDisputesPanelProps) {
  const [page, setPage] = useState(1);
  const query = useCardDisputes(kind, cardId, page);

  const [accumulated, setAccumulated] = useState<CardDispute[]>([]);
  const [seenPage, setSeenPage] = useState<number | null>(null);

  if (query.isError) {
    return (
      <article className="bcc-paper">
        <Header cardName={cardName} />
        <div className="px-8 py-12">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load disputes: {query.error.message}
          </p>
        </div>
      </article>
    );
  }

  if (query.isPending) {
    return (
      <article className="bcc-paper">
        <Header cardName={cardName} />
        <div className="px-8 py-12">
          <p className="bcc-mono text-ink-soft">Loading disputes…</p>
        </div>
      </article>
    );
  }

  const data = query.data;
  if (seenPage !== page) {
    if (page === 1) {
      setAccumulated(data.items);
    } else {
      setAccumulated((prev) => [...prev, ...data.items]);
    }
    setSeenPage(page);
  }

  if (accumulated.length === 0) {
    return (
      <article className="bcc-paper">
        <Header cardName={cardName} />
        <EmptyState
          kicker="NO DISPUTES ON FILE"
          heading={`No disputes filed against ${cardName}.`}
          hint={`Disputes surface here when a member opens a formal challenge — adversarial signal viewers should weigh against the reviews and backing.`}
        />
      </article>
    );
  }

  const hasMore = data.pagination.page < data.pagination.total_pages;

  return (
    <article className="bcc-paper">
      <Header cardName={cardName} total={data.pagination.total} />
      <div className="px-5 py-5">
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {accumulated.map((dispute) => (
            <DisputeRow key={dispute.id} dispute={dispute} />
          ))}
        </ul>

        {hasMore && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              className="bcc-mono border border-ink/30 bg-cardstock px-4 py-2 text-ink"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            >
              LOAD MORE
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function Header({ cardName, total }: { cardName: string; total?: number }) {
  return (
    <header className="bcc-paper-head">
      <h3
        className="bcc-stencil"
        style={{ fontSize: "16px", letterSpacing: "0.18em" }}
      >
        Disputes
      </h3>
      <span
        className="bcc-mono text-cardstock-deep"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {total !== undefined ? `${total} OPEN` : `AGAINST ${cardName.toUpperCase()}`}
      </span>
    </header>
  );
}

function DisputeRow({ dispute }: { dispute: CardDispute }) {
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <span
          className="bcc-mono shrink-0 inline-flex h-9 items-center justify-center bg-dispute px-2 text-cardstock"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          aria-label="Open dispute"
        >
          OPEN
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <FlaggerRef flagger={dispute.flagger} />
            <span
              className="bcc-mono shrink-0 text-ink-soft"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            >
              {dispute.posted_at_label}
            </span>
          </div>
          {dispute.body !== "" && (
            <p className="mt-2 font-serif text-ink" style={{ fontSize: "14px", lineHeight: 1.55 }}>
              {dispute.body}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function FlaggerRef({ flagger }: { flagger: MemberSummary }) {
  const href = `/u/${flagger.handle}` as Route;
  const initial =
    flagger.display_name !== "" ? flagger.display_name.charAt(0).toUpperCase() : "·";

  return (
    <Link
      href={href}
      className="group inline-flex min-w-0 items-center gap-2 hover:underline"
      aria-label={`Open ${flagger.display_name}'s profile`}
    >
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/20 bg-cardstock-deep">
        {flagger.avatar_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={flagger.avatar_url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span className="bcc-stencil text-ink/60" style={{ fontSize: "10px" }} aria-hidden>
            {initial}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span
          className="bcc-stencil block truncate text-ink"
          style={{ fontSize: "14px" }}
        >
          {flagger.display_name}
        </span>
        <span
          className="bcc-mono block truncate text-ink-soft"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          @{flagger.handle.toUpperCase()}
        </span>
      </span>
    </Link>
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
