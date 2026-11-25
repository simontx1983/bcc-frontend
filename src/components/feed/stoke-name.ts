/**
 * F-264: the Stoke toggle's accessible name. One stable name — the
 * pressed state is aria-pressed's job, not the label's — and it carries
 * the count, which the visible label shows (on a phone, the count is all
 * it shows) but an aria-label would otherwise hide. Shared by the post
 * pill (ReactionRail) and the comment pill (CommentDrawer).
 */
export function stokeAccessibleName(count: number): string {
  return count > 0 ? `Stoke, ${count}` : "Stoke";
}
