"use client";

/**
 * FlipCard — shared front/back flip primitive.
 *
 * Encapsulates the 3D-flip mechanics that `FlippableNftCard` invented for
 * the §4.7.4 communities discovery grid:
 *   - aspect-square outer (cards live in a square grid)
 *   - `[perspective:1000px]` + `[transform-style:preserve-3d]` on the
 *     inner so the children rotate in real 3D
 *   - `[backface-visibility:hidden]` on each face so the inactive side
 *     never shows through
 *   - reduced-motion users get an instant flip (no transition); the
 *     swap still works because backface-visibility hides the inactive
 *     face
 *
 * Accessibility:
 *   - The outer is `role="button"` (NOT a `<button>`) so the back face
 *     can render a real `<a>`/`<Link>` without nesting interactive
 *     content. `aria-pressed` reflects the flipped state. Enter / Space
 *     toggle.
 *   - `ariaLabelFront` / `ariaLabelBack` are required because the
 *     content swap is not announced by screen readers; we tell the SR
 *     what the user is looking at.
 *   - Children must call `e.stopPropagation()` on any in-card link so
 *     navigation runs instead of toggling the flip back. (Up to the
 *     consumer — this primitive doesn't wrap children's onClick.)
 *
 * Usage:
 * ```tsx
 * <FlipCard
 *   ariaLabelFront="@phillips card. Click to see trust dossier."
 *   ariaLabelBack="@phillips trust dossier. Click to flip back."
 *   front={<FrontFace ... />}
 *   back={<BackFace ... />}
 * />
 * ```
 *
 * Both `FlippableNftCard` (communities) and `FlippableMemberCard`
 * (members directory) consume this; new flip-card surfaces should too
 * rather than re-inventing the perspective/backface stack.
 */

import { useState, type ReactNode } from "react";

interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  ariaLabelFront: string;
  ariaLabelBack: string;
  /** Optional class merged onto the outer wrapper (e.g., focus ring overrides). */
  className?: string;
}

export function FlipCard({
  front,
  back,
  ariaLabelFront,
  ariaLabelBack,
  className,
}: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? ariaLabelBack : ariaLabelFront}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className={[
        "group relative block aspect-square cursor-pointer",
        "[perspective:1000px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cardstock focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={
          "relative h-full w-full [transform-style:preserve-3d] " +
          "motion-safe:transition-transform motion-safe:duration-500 " +
          (flipped ? "[transform:rotateY(180deg)]" : "")
        }
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          {front}
        </div>
        <div
          className={
            "absolute inset-0 [backface-visibility:hidden] " +
            "[transform:rotateY(180deg)]"
          }
        >
          {back}
        </div>
      </div>
    </div>
  );
}
