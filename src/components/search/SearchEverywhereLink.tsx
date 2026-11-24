/**
 * "Search everywhere for '…' →" (Structure A §9): when a scoped search
 * finds nothing, hand the same words to the global search results page,
 * so nobody is stranded on a page that was the wrong scope.
 *
 * Renders nothing for an empty query: without a search there is nothing
 * to hand over.
 *
 * `surface="paper"` is for the cardstock empty states (`bcc-paper`), which
 * stay light in both themes: there the link uses ink, as the rest of the
 * paper's text does. The app colour would vanish on paper in dark mode.
 */

import Link from "next/link";
import type { Route } from "next";

const SURFACE = {
  app: "text-bcc-text hover:text-bcc-accent",
  paper: "text-ink hover:text-ink-soft",
} as const;

export function SearchEverywhereLink({
  query,
  surface = "app",
}: {
  query: string;
  surface?: "app" | "paper";
}) {
  const q = query.trim();
  if (q === "") return null;
  return (
    <Link
      href={`/search?q=${encodeURIComponent(q)}` as Route}
      className={`bcc-mono mt-4 inline-flex min-h-[44px] items-center gap-1 text-[12px] tracking-[0.08em] underline underline-offset-2 ${SURFACE[surface]}`}
    >
      Search everywhere for &ldquo;{q}&rdquo; <span aria-hidden>→</span>
    </Link>
  );
}
