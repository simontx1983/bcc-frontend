/**
 * NotYetActiveBadge — marks a wallet holding whose collection has not
 * been verified, so its holder community does not exist yet
 * (`collection_verified === false`, contract §4 `GET /nft-selections/picker`).
 *
 * A LABEL, NOT A STATE CHANGE. An unverified item is still fully
 * selectable, so the badge never dims, disables or hides the thing it
 * sits on — it only says why that item's community is not live.
 *
 * The visible text is the whole message. The `title` tooltip adds the
 * detail on hover, but touch devices never show a `title`, so nothing
 * the user needs to know may live only there.
 *
 * Accessibility: `aria-hidden`, because every current host is an
 * interactive control (the picker tile is a `<button>`) that carries the
 * meaning in its own accessible name. A host that is NOT interactive
 * must say it in its own text instead of relying on this badge.
 *
 * Fixed paper/ink family (CLAUDE.md ▸ Color rule, family B): it is
 * drawn over NFT artwork on a paper tile, neither of which follows the
 * theme. `ink` and `cardstock` resolve to the same values in light and
 * dark, and `bg-ink/80` holds cream text above 4.5:1 even over a white
 * image.
 *
 * Render rule, enforced at the call site: only when the payload says
 * `collection_verified === false`. Absent means "no information" and
 * reads as verified.
 *
 * Server component-safe: no state, no effects, no browser APIs.
 */

export const NOT_YET_ACTIVE_LABEL = "Not yet active";
export const NOT_YET_ACTIVE_TOOLTIP =
  "This collection's holder community isn't active yet.";

export function NotYetActiveBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      title={NOT_YET_ACTIVE_TOOLTIP}
      className={[
        "bcc-mono inline-flex items-center rounded-[2px] bg-ink/80 px-1.5 py-0.5 text-[9px] uppercase leading-none tracking-[0.16em] text-cardstock",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {NOT_YET_ACTIVE_LABEL}
    </span>
  );
}
