"use client";

/**
 * CardReviewsPanel — Reviews tab content for entity profiles AND
 * member profiles (v1.48: kind `user_profile` reads a member's
 * received reviews; `cardId` is then the raw user id, translated to
 * the self-page server-side).
 *
 * Paginated list of reviews filed against the target (server filters
 * by `votes.page_id`). Each row shows:
 *   - GRADE box (A/B/C — the shared .bcc-grade ink/weld stencil, same
 *     element the profile ReviewsPanel uses)
 *   - Author ref (avatar + display_name + safety-accented handle)
 *   - Review body
 *   - Posted-at relative label
 *
 * Tokens follow the paper-panel grammar (ink / weld / safety /
 * ink-ghost) — NOT cardstock, which is reserved for cards/ per the
 * color-token guard.
 *
 * Mirrors the user-side ReviewsPanel rendering but flips the framing —
 * here the page IS the subject, so each row leads with the author
 * rather than the subject.
 *
 * Pagination: `useInfiniteQuery` (page+perPage per backend). TanStack owns
 * the page list, so "LOAD MORE" is one `fetchNextPage()` and there is no
 * local accumulator to keep in step with the query — see useCardTabs for why
 * the previous hand-rolled version was replaced.
 */

import Link from "next/link";
import type { Route } from "next";

import { useCardReviews } from "@/hooks/useCardTabs";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { humanizeCode } from "@/lib/api/errors";
import type {
  CardReview,
  MemberSummary,
  ReviewTargetKind,
} from "@/lib/api/types";

interface CardReviewsPanelProps {
  kind: ReviewTargetKind;
  cardId: number;
  cardName: string;
}

export function CardReviewsPanel({ kind, cardId, cardName }: CardReviewsPanelProps) {
  const query = useCardReviews(kind, cardId);

  // Pages in fetch order; TanStack appends only on success, so a failed
  // LOAD MORE leaves this exactly as it was.
  const reviews: CardReview[] = query.data?.pages.flatMap((p) => p.items) ?? [];
  const lastPage = query.data?.pages[query.data.pages.length - 1];

  /**
   * Retry the request that FAILED, not the ones that succeeded.
   *
   * `refetch()` on an infinite query re-runs the pages already in the cache —
   * which, after a failed LOAD MORE, is every page EXCEPT the one that
   * failed. So the first-page failure retries with `refetch`, and a failed
   * next page retries with `fetchNextPage`, which asks for the same page
   * param again. This is what keeps a failure from skipping a page.
   */
  const retry = () => {
    if (reviews.length === 0) {
      void query.refetch();
    } else {
      void query.fetchNextPage();
    }
  };

  // §γ — copy is keyed on err.code; never render err.message.
  const failureCopy = humanizeCode(
    query.error,
    {
      bcc_unauthorized: "Sign in to read reviews.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "Reviews are temporarily unavailable. Try again shortly.",
    },
    "Couldn't load reviews. Try again in a moment.",
  );

  // Whole-panel failure ONLY when nothing has loaded. A failed LOAD MORE
  // keeps the pages already fetched, and returning here would throw the
  // already-read reviews away; that case is handled at the foot of the
  // list instead.
  if (query.isError && reviews.length === 0) {
    return (
      <article className="bcc-paper">
        <Header cardName={cardName} />
        <LoadFailure surface="paper" message={failureCopy} onRetry={retry} />
      </article>
    );
  }

  if (query.isPending && reviews.length === 0) {
    return (
      <article className="bcc-paper">
        <Header cardName={cardName} />
        <div className="px-8 py-12">
          <p className="bcc-mono text-ink-soft">Loading reviews…</p>
        </div>
      </article>
    );
  }

  if (!query.isError && reviews.length === 0) {
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

  return (
    <article className="bcc-paper">
      <Header
        cardName={cardName}
        {...(lastPage !== undefined ? { total: lastPage.pagination.total } : {})}
      />
      <div className="px-5 py-5">
        <ul className="divide-y divide-ink/10 border-y border-ink/10">
          {reviews.map((review) => (
            <ReviewRow key={review.id} review={review} />
          ))}
        </ul>

        {/* Cursor safety: while the current page is failing, LOAD MORE is
            withdrawn — advancing would skip past the page that failed.
            Retry refetches that same page, and ordinary paging returns
            once it succeeds. */}
        {query.isError ? (
          <LoadFailure surface="paper" message={failureCopy} onRetry={retry} />
        ) : (
          query.hasNextPage && (
            <div className="mt-6 flex justify-center">
              {/* 44px minimum: this is the panel's only pagination control,
                  and at 10px with no padding it was a ~13px-tall tap target.
                  The label keeps its type scale — only the hit area grows. */}
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="bcc-mono inline-flex min-h-[44px] items-center justify-center px-4 text-safety hover:underline disabled:opacity-50"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                LOAD MORE →
              </button>
            </div>
          )
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
        className="bcc-mono text-weld"
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
              className="bcc-mono shrink-0 text-ink-ghost"
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
  // The shared .bcc-grade ink/weld stencil box — same element the
  // profile ReviewsPanel renders, so grades read identically on
  // member and entity surfaces. (The previous per-grade color pills
  // were a panel-local invention that clashed with the site grammar.)
  return (
    <span className="bcc-grade shrink-0" aria-label={`Grade ${grade}`}>
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
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/20 bg-ink/10">
        {author.avatar_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={author.avatar_url}
            alt=""
            loading="lazy"
            decoding="async"
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
          className="bcc-mono block truncate text-safety"
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
