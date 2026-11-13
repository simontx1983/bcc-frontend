"use client";

/**
 * REVIEWS · N — the two latest reviews filed ABOUT this member (reviews
 * RECEIVED), read through the same useCardReviews("user_profile") query
 * the profile Reviews tab and the /reviews page use, so they share one
 * cache entry. N is the server's `counts.reviews_received`.
 *
 * The grade is the server's A/B/C, shown in the shared `.bcc-grade` box
 * the review panels use — it is not converted into stars.
 */

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { useCardReviews } from "@/hooks/useCardTabs";
import { isPermissionDenial } from "@/lib/api/errors";

import { AboutCard, AboutSeeAll } from "./AboutCard";

const PREVIEW_COUNT = 2;

export function AboutReviewsCard({
  handle,
  userId,
  total,
  aside,
}: {
  handle: string;
  userId: number;
  total: number;
  aside?: ReactNode;
}) {
  const query = useCardReviews("user_profile", userId);
  const base = `/u/${encodeURIComponent(handle)}/reviews`;

  const items = (query.data?.pages[0]?.items ?? []).slice(0, PREVIEW_COUNT);

  if (query.isSuccess && items.length === 0) return null;
  // A permission boundary withdraws the card rather than offering a Retry
  // that can only fail the same way.
  if (query.isError && items.length === 0 && isPermissionDenial(query.error)) return null;

  return (
    <AboutCard label="Reviews" count={total} testId="about-card-reviews" aside={aside}>
      {query.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" count={PREVIEW_COUNT} />
        </div>
      ) : query.isError && items.length === 0 ? (
        <LoadFailure
          message="Couldn't load reviews. Try again in a moment."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-bcc-border">
          {items.map((review) => (
            <li key={review.id}>
              <Link
                href={`${base}#review-${review.id}` as Route}
                className="flex min-h-[44px] gap-3 py-3 hover:bg-bcc-surface-hover"
              >
                <span className="bcc-grade shrink-0" aria-label={`Grade ${review.grade}`}>
                  {review.grade}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="bcc-mono truncate text-[11px] tracking-[0.12em] text-bcc-text-safety">
                    @{review.author.handle}
                  </span>
                  {review.text !== "" && (
                    <span
                      className="mt-1 line-clamp-3 font-serif text-bcc-text"
                      style={{ fontSize: "14px", lineHeight: 1.5 }}
                    >
                      &ldquo;{review.text}&rdquo;
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <AboutSeeAll href={base as Route}>
        See all {total} reviews <span aria-hidden>→</span>
      </AboutSeeAll>
    </AboutCard>
  );
}
