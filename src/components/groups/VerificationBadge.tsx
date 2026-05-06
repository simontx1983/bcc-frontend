/**
 * VerificationBadge — server-authoritative on-chain verification chip.
 *
 * Per contract §4.7.1 line 1460 the label MUST be rendered verbatim —
 * never replace the prop with a hard-coded "Verified" string. The
 * server pins the copy ("On-Chain Verified"); the frontend just paints
 * it.
 *
 * Composition: the badge intentionally does NOT bake in font or
 * text-size. Wrap it in a parent that sets `bcc-mono` + a text-size
 * class (e.g. `text-[10px]` or `text-[11px]`) so it matches the
 * surrounding chip/row styling. Pass layout-context classes
 * (`shrink-0`, etc.) via `className`.
 *
 * Used by:
 *   - components/feed/FeedItemCard.tsx (group block on FeedItem, §3.3)
 *   - components/settings/CommunitiesList.tsx (§4.7.1)
 *   - components/auth/EligibleCommunitiesModal.tsx (§4.7.1)
 *   - app/communities/page.tsx (§4.7.4)
 */
export function VerificationBadge({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 uppercase tracking-[0.16em] text-blueprint" +
        (className === "" ? "" : " " + className)
      }
    >
      <span aria-hidden>◆</span>
      {label}
    </span>
  );
}
