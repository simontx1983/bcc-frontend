// ─────────────────────────────────────────────────────────────────────
// Skeleton — the shared loading placeholder.
//
// Consolidates the `bcc-panel … animate-pulse opacity-40` idiom that was
// copy-pasted across DirectoryGrid / CreatorGallery / FeedView /
// SearchResultsTab. Two of those forgot `motion-safe:`, so the pulse ran
// even under prefers-reduced-motion — baking `motion-safe:` in here fixes
// that drift for every consumer at once.
//
// The caller supplies the shape via `className` (height, aspect, width)
// so each surface keeps its own dimensions, e.g.:
//   <Skeleton className="h-40" count={4} />          (div contexts)
//   <li className={cx(SKELETON_CLASS, "h-[460px]")}/>  (list <ul>/<li> cases)
//
// SKELETON_CLASS is the single source of truth for the placeholder look;
// the <Skeleton> component is the convenience wrapper for plain-<div>
// contexts (e.g. replacing bare "Loading…" text).
//
// Presentational only.
// ─────────────────────────────────────────────────────────────────────

/** Base placeholder look. Compose with a shape class (height/aspect/width). */
export const SKELETON_CLASS = "bcc-panel opacity-40 motion-safe:animate-pulse";

type SkeletonProps = {
  /** Shape/size utility classes for each placeholder (height, aspect, width). */
  className?: string;
  /** Render N identical placeholders. Defaults to 1. */
  count?: number;
};

export function Skeleton({ className = "", count = 1 }: SkeletonProps) {
  const cls = SKELETON_CLASS + " " + className;
  if (count === 1) {
    return <div aria-hidden className={cls} />;
  }
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className={cls} />
      ))}
    </>
  );
}
