"use client";

/**
 * CardReviewsPanel — entity-profile Reviews tab content.
 *
 * Paginated list of reviews filed against the entity (server filters
 * by `votes.page_id`). Each row shows:
 *   - GRADE pill (A/B/C, safety / cardstock-deep / dispute color)
 *   - Author MemberRow (avatar + display_name + handle + rank chip)
 *   - Review body
 *   - Posted-at relative label
 *
 * Mirrors the user-side ReviewsPanel rendering but flips the framing —
 * here the page IS the subject, so each row leads with the author
 * rather than the subject.
 *
 * Pagination: page+perPage (per backend); FE accumulates pages on
 * "LOAD MORE" so the list grows in-place rather than replacing.
 */

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { useCardReviews } from "@/hooks/useCardTabs";
import type {
  CardReview,
  EntityCardKind,
  MemberSummary,
} from "@/lib/api/types";

interface CardReviewsPanelProps {
  kind: EntityCardKind;
  cardId: number;
  cardName: string;
}

export function CardReviewsPanel({ kind, cardId, cardName }: CardReviewsPanelProps) {
  const [page, setPage] = useState(1);
  const query = useCardReviews(kind, cardId, page);

  // Accumulator pattern: each Load More appends; pagination keys on
  // `page` so React Query treats each page as its own cache entry.
  const [accumulated, setAccumulated] = useState<CardReview[]>([]);
  const [seenPage, setSeenPage] = useState<number | null>(null);

  if (query.isError) {
    return (
      <article className="bcc-paper">
        <Header cardName={cardName} />
        <div className="px-8 py-12">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load reviews: {query.error.message}
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
          <p className="bcc-mono text-ink-soft">Loading reviews…</p>
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
          kicker="NO REVIEWS ON FILE"
          heading={`No reviews of ${cardName} yet.`}
          hint={`Be the first to file a review — reviews are the trust signal viewers use to evaluate ${cardName}.`}
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
          {accumulated.map((review) => (
            <ReviewRow key={review.id} review={review} />
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
        Reviews
      </h3>
      <span
        className="bcc-mono text-cardstock-deep"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        {total !== undefined ? `${total} ON FILE` : `OF ${cardName.toUpperCase()}`}
      </span>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ReviewRow — compact row: grade pill, author block, body, timestamp.
// ──────────────────────────────────────────────────────────────────────

function ReviewRow({ review }: { review: CardReview }) {
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <GradePill grade={review.grade} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <AuthorRef author={review.author} />
            <span
              className="bcc-mono shrink-0 text-ink-soft"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            >
              {review.posted_at_label}
            </span>
          </div>
          {review.text !== "" && (
            <p className="mt-2 font-serif text-ink" style={{ fontSize: "14px", lineHeight: 1.55 }}>
              {review.text}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function GradePill({ grade }: { grade: "A" | "B" | "C" }) {
  // A = trust signal (safety orange); B = neutral; C = caution.
  const styles = {
    A: "bg-safety text-cardstock",
    B: "bg-ink/20 text-ink",
    C: "bg-dispute text-cardstock",
  }[grade];

  return (
    <span
      className={`bcc-stencil shrink-0 flex h-9 w-9 items-center justify-center ${styles}`}
      style={{ fontSize: "18px" }}
      aria-label={`Grade ${grade}`}
    >
      {grade}
    </span>
  );
}

function AuthorRef({ author }: { author: MemberSummary }) {
  const href = `/u/${author.handle}` as Route;
  const initial =
    author.display_name !== "" ? author.display_name.charAt(0).toUpperCase() : "·";

  return (
    <Link
      href={href}
      className="group inline-flex min-w-0 items-center gap-2 hover:underline"
      aria-label={`Open ${author.display_name}'s profile`}
    >
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/20 bg-cardstock-deep">
        {author.avatar_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatar_url}
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
          {author.display_name}
        </span>
        <span
          className="bcc-mono block truncate text-ink-soft"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          @{author.handle.toUpperCase()}
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
