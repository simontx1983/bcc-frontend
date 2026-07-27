/**
 * actionIcons — single source of truth for the icons shared by the feed
 * action bar, the comment rail, and both composers. Before this module
 * the same glyphs were hand-redrawn per surface with drifting sizes/
 * paths (see HANDOVER-comment-v2-polish.md Item 0); every caller now
 * imports from here instead of inlining its own <svg>.
 *
 * Backed by `lucide-react` (task 5, icon standardization) except
 * FlameIcon, which stays a bespoke hand-drawn glyph on purpose — Stoke
 * is BCC's own mark, not a generic library icon. Every export keeps its
 * original call signature (default sizes, className passthrough) so no
 * consumer needed to change.
 *
 * All icons take `stroke="currentColor"` so the caller owns color via
 * text color, except FlameIcon which fills/strokes by its own `color`/
 * `outline` props (Stoke's fill state isn't a text-color concept).
 */

import {
  Clock,
  Eye,
  Image as LucideImage,
  MessageCircle,
  Sparkles,
  SquareArrowOutUpRight,
  Zap,
} from "lucide-react";

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
  return <MessageCircle size={size} className={className} aria-hidden strokeWidth={1.8} />;
}

export function ShareIcon({ size = 17, className }: { size?: number; className?: string }) {
  return <SquareArrowOutUpRight size={size} className={className} aria-hidden strokeWidth={1.8} />;
}

export function ClockIcon({ size = 13, className }: { size?: number; className?: string }) {
  return <Clock size={size} className={className} aria-hidden strokeWidth={1.8} />;
}

/** Canonical photo-attach glyph — matches the post composer's original icon. */
export function PhotoIcon({ size = 17, className }: { size?: number; className?: string }) {
  return <LucideImage size={size} className={className} aria-hidden strokeWidth={1.8} />;
}

// ─────────────────────────────────────────────────────────────────────
// Feed scope icons (Item 1) — For You / Watching / Signals segmented
// control. Sparkles reads as "picked for you"; a house was rejected
// (echoes the sidebar's Home nav, confusing on mobile).
// ─────────────────────────────────────────────────────────────────────

export function SparklesIcon({ size = 15, className }: { size?: number; className?: string }) {
  return <Sparkles size={size} className={className} aria-hidden strokeWidth={1.8} />;
}

export function EyeIcon({ size = 15, className }: { size?: number; className?: string }) {
  return <Eye size={size} className={className} aria-hidden strokeWidth={1.8} />;
}

export function BoltIcon({ size = 15, className }: { size?: number; className?: string }) {
  return <Zap size={size} className={className} aria-hidden strokeWidth={1.8} />;
}
