"use client";

/**
 * ReviewsPanel — paper sheet listing the member's written reviews.
 * Letter-grade boxes anchor each row; subject + scope + line-clamped
 * preview body to the right.
 *
 * Lazy-fetches via useUserReviews on mount.
 */

import { useUserReviews } from "@/hooks/useUserActivity";
import type { MemberReview } from "@/lib/api/types";

interface ReviewsPanelProps {
  handle: string;
}

export function ReviewsPanel({ handle }: ReviewsPanelProps) {
  const query = useUserReviews(handle);

  if (query.isPending) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p className="bcc-mono text-ink-soft">Loading reviews…</p>
        </div>
      </article>
    );
  }

  if (query.isError) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load reviews: {query.error.message}
          </p>
        </div>
      </article>
    );
  }

  if (query.data.hidden) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p
            className="bcc-mono mb-3 text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            PRIVATE
          </p>
          <h4
            className="bcc-stencil text-ink"
            style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
          >
            Reviews are hidden.
          </h4>
          <p
            className="font-serif italic text-ink-soft"
            style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
          >
            This member has chosen to keep their reviews off the public
            page. Their grades still inform the trust system.
          </p>
        </div>
      </article>
    );
  }

  return <ReviewsPanelStatic reviews={query.data.items} />;
}

// ──────────────────────────────────────────────────────────────────────
// Static variant — renders an array. Both header + list + empty
// states live here so the live variant can fall through cleanly.
// ──────────────────────────────────────────────────────────────────────

function ReviewsPanelStatic({ reviews }: { reviews: MemberReview[] }) {
  return (
    <article className="bcc-paper">
      <Header />

      {reviews.length === 0 ? (
        <ReviewsEmpty />
      ) : (
        <ul>
          {reviews.map((review) => (
            <li
              key={review.id}
              className="grid grid-cols-[62px_1fr] gap-4 border-b border-dashed border-ink/22 px-5 py-4 last:border-b-0"
            >
              <span className="bcc-grade">{review.grade}</span>
              <div>
                <div
                  className="bcc-mono text-ink-ghost"
                  style={{ fontSize: "9px", letterSpacing: "0.18em", marginBottom: "2px" }}
                >
                  {review.scope_label}
                </div>
                <div
                  className="bcc-stencil text-ink"
                  style={{ fontSize: "17px", letterSpacing: "0.02em", lineHeight: 1.1 }}
                >
                  {review.subject}
                </div>
                <p
                  className="font-serif italic text-ink"
                  style={{
                    fontSize: "13.5px",
                    lineHeight: 1.45,
                    marginTop: "6px",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  &ldquo;{review.text}&rdquo;
                </p>
                <div
                  className="bcc-mono mt-2 flex flex-wrap gap-3 text-ink-ghost"
                  style={{ fontSize: "9px", letterSpacing: "0.14em" }}
                >
                  <span>
                    ON <strong className="text-safety" style={{ fontWeight: 500 }}>@{review.subject_handle}</strong>
                  </span>
                  <span>· {review.posted_at_label}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Header() {
  return (
    <header className="bcc-paper-head">
      <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
        Reviews on file
      </h3>
      <span className="bcc-mono text-weld" style={{ fontSize: "9px" }}>
        MOST RECENT FIRST
      </span>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ReviewsEmpty — paper-sheet empty state. Stencil headline + a single
// editorial line; deliberately neutral on owner-vs-other since the
// panel doesn't know which is loaded.
// ──────────────────────────────────────────────────────────────────────

function ReviewsEmpty() {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NOTHING ON FILE
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        No reviews written.
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        When a review goes on the wall, it lives here &mdash; letter grade,
        full text, signed and stuck. The chain remembers every grade.
      </p>
    </div>
  );
}
