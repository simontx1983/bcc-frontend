/**
 * GroupGatedNotice — privacy-locked fallback for the §4.7.6 feed and
 * §4.7.7 roster sections of the group-detail page.
 *
 * Renders a `bcc-caution-tape` divider above a stencil "GATED" label
 * and the server's `unlock_hint` text verbatim per §A4 / §N7.
 * Frontend NEVER substitutes the server copy — when `hint` is null we
 * fall back to the contextual default per `variant`.
 *
 * No `"use client"` — pure presentation. Safe in server components.
 */

interface GroupGatedNoticeProps {
  /** `permissions.can_read_feed.unlock_hint` for `variant="feed"`,
   *  or "Join the group to see its roster." for `variant="roster"`.
   *  Render verbatim when non-null; fall back to the default below
   *  when null. */
  hint: string | null;
  variant?: "feed" | "roster";
}

const DEFAULT_HINT_BY_VARIANT: Record<NonNullable<GroupGatedNoticeProps["variant"]>, string> = {
  feed:   "This feed is private to members.",
  roster: "This roster is private to members.",
};

const HEADING_BY_VARIANT: Record<NonNullable<GroupGatedNoticeProps["variant"]>, string> = {
  feed:   "FEED PRIVATE",
  roster: "ROSTER PRIVATE",
};

export function GroupGatedNotice({ hint, variant = "feed" }: GroupGatedNoticeProps) {
  const heading = HEADING_BY_VARIANT[variant];
  const message = hint !== null && hint !== "" ? hint : DEFAULT_HINT_BY_VARIANT[variant];

  return (
    <div className="bcc-panel relative overflow-hidden">
      {/* Diagonal yellow/black warning stripe across the top edge. */}
      <div aria-hidden className="bcc-caution-tape h-2 w-full" />

      <div className="px-6 py-8 text-center">
        <p
          className="bcc-mono text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          GATED
        </p>
        <h3
          className="bcc-stencil mt-2 text-ink"
          style={{ fontSize: "26px", letterSpacing: "0.06em", lineHeight: 1.05 }}
        >
          {heading}
        </h3>
        <p
          className="font-serif italic text-ink-soft mx-auto mt-3"
          style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "44ch" }}
        >
          {message}
        </p>
      </div>

      <div aria-hidden className="bcc-caution-tape h-2 w-full" />
    </div>
  );
}
