"use client";

/**
 * ActionRailButton — shared Reply/Share pill for both the feed action bar
 * and the comment rail, so the two surfaces can't drift apart on icon,
 * label, sizing, or hover-color grammar (see HANDOVER-comment-v2-polish.md
 * Items 6/7/12). Stoke keeps its own renderer (ReactionRail /
 * CommentStokeButton) since it carries the flame/glow/burst apparatus,
 * but shares this same lean sizing.
 *
 * Color grammar: neutral at rest, a caller-supplied hover color (Reply →
 * info blue, Share → success green) — the `hoverClassName` must be a
 * literal Tailwind arbitrary-value string at the call site so the JIT
 * scanner can see it.
 */

import type { ReactNode } from "react";

export function ActionRailButton({
  icon,
  label,
  count,
  hoverClassName,
  onClick,
  ariaLabel,
  title,
  disabled = false,
  soon = false,
}: {
  icon: ReactNode;
  label: string;
  /** Omit to hide the count slot entirely; 0 still hides it. */
  count?: number;
  /** Literal Tailwind hover class, e.g. "hover:text-[var(--bcc-info)]". */
  hoverClassName: string;
  onClick?: () => void;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  /** "Coming soon" stub — same look/hover, but non-interactive. */
  soon?: boolean;
}) {
  const classes =
    "bcc-mono inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-[var(--bcc-text-secondary)] transition-colors duration-150 hover:bg-[var(--bcc-surface-active)] " +
    hoverClassName +
    (soon ? " cursor-not-allowed opacity-70" : " disabled:cursor-not-allowed disabled:opacity-60");

  const content = (
    <>
      <span className="inline-flex">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {count !== undefined && count > 0 && <span>{count}</span>}
    </>
  );

  if (soon) {
    return (
      <span title={title} aria-disabled="true" className={classes}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={classes}
    >
      {content}
    </button>
  );
}
