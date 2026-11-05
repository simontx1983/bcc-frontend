/**
 * PageContextLine — the "Operator of {name}" line on a post written for a
 * validator page. Shared by FeedItemCard and the permalink's PostDetail so
 * the label reads the same on every surface.
 *
 * `label` and `url` are server-rendered and shown verbatim (§A2): the client
 * never composes the wording or builds the route from `id` or `handle`. Same
 * mono secondary line as the group attribution beside it in FeedItemCard.
 */

import type { Route } from "next";
import Link from "next/link";

import type { FeedPageContext } from "@/lib/api/types";

export function PageContextLine({
  context,
}: {
  context: FeedPageContext | null | undefined;
}) {
  if (context === null || context === undefined) return null;

  return (
    <p className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)]">
      <Link
        href={context.url as Route}
        className="hover:text-[var(--bcc-text)] hover:underline"
      >
        {context.label}
      </Link>
    </p>
  );
}
