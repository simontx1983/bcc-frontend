/**
 * "Search everywhere for '…' →" (Structure A §9): when a scoped search
 * finds nothing, hand the same words to the global search results page,
 * so nobody is stranded on a page that was the wrong scope.
 *
 * Renders nothing for an empty query: without a search there is nothing
 * to hand over.
 */

import Link from "next/link";
import type { Route } from "next";

export function SearchEverywhereLink({ query }: { query: string }) {
  const q = query.trim();
  if (q === "") return null;
  return (
    <Link
      href={`/search?q=${encodeURIComponent(q)}` as Route}
      className="bcc-mono mt-4 inline-flex min-h-[44px] items-center gap-1 text-[12px] tracking-[0.08em] text-bcc-text underline underline-offset-2 hover:text-bcc-accent"
    >
      Search everywhere for &ldquo;{q}&rdquo; <span aria-hidden>→</span>
    </Link>
  );
}
