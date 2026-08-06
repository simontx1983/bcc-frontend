/**
 * CardGridSkeleton — loading placeholder for a <CardGrid>.
 *
 * Same `auto-fit,316px` track and same 460px cell height as the real
 * grid, so the swap to data doesn't shift layout. Extracted from
 * DirectoryGrid's inline skeleton once a second card surface (the
 * /watching tabs) needed it.
 *
 * The pulse comes from SKELETON_CLASS, which already bakes in
 * `motion-safe:` — never re-roll the animation here.
 *
 * Presentational only.
 */

import { SKELETON_CLASS } from "@/components/ui/Skeleton";

interface CardGridSkeletonProps {
  /** Accessible name for the placeholder list. */
  ariaLabel?: string;
}

export function CardGridSkeleton({
  ariaLabel = "Loading cards",
}: CardGridSkeletonProps) {
  return (
    <ul
      aria-label={ariaLabel}
      className="grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,316px)]"
    >
      {Array.from({ length: 8 }).map((_, idx) => (
        <li key={idx} aria-hidden className={SKELETON_CLASS + " h-[460px]"} />
      ))}
    </ul>
  );
}
