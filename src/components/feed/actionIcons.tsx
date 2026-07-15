/**
 * actionIcons — single source of truth for the icons shared by the feed
 * action bar, the comment rail, and both composers. Before this module
 * the same glyphs were hand-redrawn per surface with drifting sizes/
 * paths (see HANDOVER-comment-v2-polish.md Item 0); every caller now
 * imports from here instead of inlining its own <svg>.
 *
 * All icons take `stroke="currentColor"` so the caller owns color via
 * text color, except FlameIcon which fills/strokes by its own `color`/
 * `outline` props (Stoke's fill state isn't a text-color concept).
 */

export function FlameIcon({
  size,
  color,
  outline,
  className = "",
}: {
  size: number;
  color: string;
  /** true = ash outline (not stoked); false = solid fill (stoked). */
  outline: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
      style={{ transition: "width 200ms ease, height 200ms ease" }}
    >
      <path
        d="M12 2c1.2 2.6-0.4 4-1.4 5.4C9.4 8.8 8 10.4 8 12.8c0 .9.2 1.7.6 2.4-1-.5-1.8-1.4-2.2-2.6-.7 1-1.1 2.2-1.1 3.5 0 3.3 2.9 6 6.7 6s6.7-2.7 6.7-6c0-2.6-1-4.3-2.3-5.9.1.8.1 1.6-.1 2.3-.4-2.6-1.9-4.6-3.5-6.2C13.6 5.3 12.7 3.7 12 2Z"
        fill={outline ? "none" : color}
        stroke={outline ? color : "none"}
        strokeWidth={outline ? 1.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ReplyIcon({ size = 17, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-2.8 2.4a.5.5 0 0 1-.82-.38V11.5h-1a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShareIcon({ size = 17, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M6.5 3.5h-2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 9 12.5 3.5M9 3.5h3.5V7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClockIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 4.8V8l2.4 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Canonical photo-attach glyph — matches the post composer's original icon. */
export function PhotoIcon({ size = 17, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5.5" cy="6" r="1.25" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.5 11L5.5 8L8.5 10.5L11 8L14.5 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Feed scope icons (Item 1) — For You / Watching / Signals segmented
// control. Sparkles reads as "picked for you"; a house was rejected
// (echoes the sidebar's Home nav, confusing on mobile).
// ─────────────────────────────────────────────────────────────────────

export function SparklesIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M8.4 1.6 9.3 5l3.4.9-3.4.9-.9 3.4-.9-3.4L4.1 5.9 7.5 5l.9-3.4Z"
        fill="currentColor"
      />
      <path
        d="M12.6 10.4 13 12l1.6.4L13 12.8l-.4 1.6-.4-1.6-1.6-.4 1.6-.4.4-1.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function EyeIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function BoltIcon({ size = 15, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M8.8 1.5 3 9h3.6L6.2 14.5 13 6.5H9.4L8.8 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}
