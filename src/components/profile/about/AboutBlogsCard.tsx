"use client";

/**
 * BLOGS · N — the member's two latest posts, read through the same
 * useUserBlog query the profile Blog tab uses (so the /blogs page and the
 * tab share its cache). N is the server's `counts.blog_posts_written`;
 * the caller hides the card when it is 0.
 *
 * Read time is not in the blog payload, so each row shows the date only.
 */

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { useUserBlog } from "@/hooks/useUserBlog";
import { formatRelativeTime } from "@/lib/format";

import { AboutCard, AboutSeeAll } from "./AboutCard";

const PREVIEW_COUNT = 2;

export function AboutBlogsCard({
  handle,
  total,
  aside,
}: {
  handle: string;
  total: number;
  aside?: ReactNode;
}) {
  const query = useUserBlog(handle);
  const seeAllHref = `/u/${encodeURIComponent(handle)}/blogs` as Route;

  const items = (query.data?.pages[0]?.items ?? []).slice(0, PREVIEW_COUNT);

  if (query.isSuccess && items.length === 0) return null;

  return (
    <AboutCard label="Blogs" count={total} testId="about-card-blogs" aside={aside}>
      {query.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-11" count={PREVIEW_COUNT} />
        </div>
      ) : query.isError && items.length === 0 ? (
        <LoadFailure
          message="Couldn't load posts. Try again in a moment."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-bcc-border">
          {items.map((item) => {
            const title = typeof item.body["title"] === "string" ? item.body["title"] : "";
            const when = formatRelativeTime(item.posted_at);
            return (
              <li key={item.id}>
                <Link
                  href={item.links.self as Route}
                  className="flex min-h-[44px] flex-col justify-center py-2 hover:underline"
                >
                  <span className="bcc-stencil text-[16px] leading-tight text-bcc-text underline decoration-[var(--bcc-accent-indicator)] underline-offset-4">
                    {title !== "" ? title : "Untitled post"}
                  </span>
                  {when !== "" && (
                    <span className="bcc-mono mt-1 text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary">
                      {when}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <AboutSeeAll href={seeAllHref}>
        See all {total} blogs <span aria-hidden>→</span>
      </AboutSeeAll>
    </AboutCard>
  );
}
