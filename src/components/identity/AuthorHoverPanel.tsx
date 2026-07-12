"use client";

/**
 * AuthorHoverPanel — the portaled glass popover that renders an
 * `AuthorCard`, shared by the avatar hover card and the @mention hover
 * card. Portaled to document.body so it floats above any `overflow:
 * hidden` ancestor; positioned by the caller via `useHovercard` coords.
 */

import { createPortal } from "react-dom";

import { AuthorCard, type AuthorCardProps } from "@/components/identity/AuthorCard";
import type { HovercardCoords } from "@/hooks/useHovercard";

type AuthorHoverPanelProps = AuthorCardProps & {
  coords: HovercardCoords;
  /** Spread onto the panel so moving onto it keeps the card open. */
  handlers: { onMouseEnter: () => void; onMouseLeave: () => void };
  /** Accessible label for the dialog. */
  label: string;
};

export function AuthorHoverPanel({
  coords,
  handlers,
  label,
  ...cardProps
}: AuthorHoverPanelProps) {
  return createPortal(
    <div
      role="dialog"
      aria-label={label}
      {...handlers}
      className="fixed z-[500] w-72 overflow-hidden rounded-2xl text-left shadow-xl"
      style={{
        top: coords.top,
        left: coords.left,
        background: "var(--bcc-glass-bg-solid)",
        backdropFilter: "blur(var(--bcc-glass-blur))",
        WebkitBackdropFilter: "blur(var(--bcc-glass-blur))",
        border: "1px solid var(--bcc-glass-border)",
      }}
    >
      <AuthorCard {...cardProps} />
    </div>,
    document.body,
  );
}
