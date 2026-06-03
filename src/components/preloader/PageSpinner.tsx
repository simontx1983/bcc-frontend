/**
 * PageSpinner — Validator Ring loader.
 *
 * 8 dots arranged in a circle, each glowing in sequence.
 * Pure CSS — no JS, no dependencies.
 *
 * Sizes:
 *   <PageSpinner />         → default 40px
 *   <PageSpinner size="sm"> → 24px
 *   <PageSpinner size="lg"> → 56px
 *
 * Used by NavigationProgress for inter-page transitions.
 * Can also be imported directly for inline loading states.
 */

import "./preloader.css";

interface PageSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PageSpinner({ size = "md", className = "" }: PageSpinnerProps) {
  const sizeClass = size !== "md" ? `bcc-spinner--${size}` : "";

  return (
    <span
      className={["bcc-spinner", sizeClass, className].filter(Boolean).join(" ")}
      role="status"
      aria-label="Loading"
    >
      <span className="bcc-spinner__ring" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="bcc-spinner__dot" />
        ))}
      </span>
    </span>
  );
}
