/**
 * F-346 — the two pieces a repost adds to a post card.
 *
 *   - RepostedByLine: "@x reposted", above the ORIGINAL on a plain-repost
 *     card (the card shows the original and acts on it, so engagement is
 *     not split across copies).
 *   - RepostedPostPreview: the original, nested read-only inside a QUOTE
 *     repost. The quote card's own action bar acts on the quote, so the
 *     preview has no controls: it is one link to the original.
 *   - RepostOriginalUnavailable: in its place when this viewer cannot see
 *     the original, or the server could not verify that they can
 *     (`repost_of_unavailable`; the two are rendered identically). The
 *     quote's own text stays.
 *
 * Both render inside the card's <article>, whose click-to-open handler
 * ignores clicks on links, so each link here navigates on its own.
 */

import Link from "next/link";
import type { Route } from "next";

import { RepostIcon } from "@/components/feed/actionIcons";
import { POST_KIND_LABELS, deriveBodySummary } from "@/components/feed/postBody";
import { formatRelativeTime } from "@/lib/format";
import type { FeedItem } from "@/lib/api/types";

/**
 * Plain vs quote is told apart by CONTENT, PeepSo's own rule (contract
 * umbrella #327; there is no marker field): the reposter's text empty or
 * whitespace-only = a plain repost, anything else = a quote. The server
 * omits a plain repost of an original this viewer can't see (or can't be
 * verified as readable) entirely, so only a quote can arrive with
 * `repost_of_unavailable`.
 */
export function isPlainRepost(item: FeedItem): item is FeedItem & { repost_of: FeedItem } {
  return item.repost_of != null && deriveBodySummary(item).trim() === "";
}

function authorName(item: FeedItem): string {
  return item.author.display_name ?? `@${item.author.handle}`;
}

/** `repost` is the reposter's wrapper item (its author, its author link). */
export function RepostedByLine({ repost }: { repost: FeedItem }) {
  return (
    <p
      data-testid="reposted-by"
      className="bcc-mono flex items-center gap-1.5 text-[11px] text-[var(--bcc-text-secondary)]"
    >
      <RepostIcon size={13} />
      <span>
        <Link href={repost.links.author as Route} className="text-[var(--bcc-text)] hover:underline">
          {authorName(repost)}
        </Link>{" "}
        reposted
      </span>
    </p>
  );
}

/**
 * In place of the nested original on a quote whose original this viewer
 * cannot see (`repost_of_unavailable`). Deliberately says only that: no
 * author, group, link or id.
 */
export function RepostOriginalUnavailable() {
  return (
    <p
      data-testid="repost-original-unavailable"
      className="bcc-mono rounded-[4px] border border-dashed border-[var(--bcc-border)] p-3 text-[11px] text-[var(--bcc-text-secondary)]"
    >
      The original post isn’t available.
    </p>
  );
}

/** The quote's original, or the unavailable block, or nothing for a non-repost. */
export function RepostedOriginal({ item }: { item: FeedItem }) {
  if (item.repost_of != null) return <RepostedPostPreview original={item.repost_of} />;
  if (item.repost_of_unavailable === true) return <RepostOriginalUnavailable />;
  return null;
}

export function RepostedPostPreview({ original }: { original: FeedItem }) {
  // Plain text only: mention links would nest an <a> inside this <a>.
  const summary = deriveBodySummary(original);
  const kindLabel = POST_KIND_LABELS[original.post_kind] ?? original.post_kind.toUpperCase();
  const when = formatRelativeTime(original.posted_at);

  return (
    <Link
      href={original.links.self as Route}
      data-testid="reposted-post-preview"
      className="block rounded-[4px] border border-[var(--bcc-border)] p-3 transition-colors hover:bg-[var(--bcc-surface-active)]"
    >
      <span className="sr-only">Original post: </span>
      <span className="bcc-mono block truncate text-[11px] text-[var(--bcc-text-secondary)]">
        <span className="text-[var(--bcc-text)]">{authorName(original)}</span>
        {when !== "" && <> · {when}</>}
      </span>
      {summary !== "" ? (
        <span className="mt-1 line-clamp-4 block whitespace-pre-line break-words font-serif text-[14px] leading-normal text-[var(--bcc-text)]">
          {summary}
        </span>
      ) : (
        // Photo / GIF posts carry no text summary; say what it is.
        <span className="bcc-mono mt-1 block text-[11px] text-[var(--bcc-text-secondary)]">
          {kindLabel === "POSTED" ? "VIEW ORIGINAL POST" : kindLabel} <span aria-hidden="true">→</span>
        </span>
      )}
    </Link>
  );
}
