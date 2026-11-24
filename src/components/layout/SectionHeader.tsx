/**
 * SectionHeader — the head of a section page: Explore, Members and
 * Communities (Site Structure A, design §10, slots 2–4).
 *
 * One shape on all three, so the sections read as one family:
 *   eyebrow  — the section and what it holds ("EXPLORE · PAGES")
 *   title    — the section's name, the same word as its menu item, never
 *              a slogan, so the menu and the page always agree
 *   lede     — one sentence on what's here
 *   action   — optional, at the right (Communities' "Create community");
 *              a section without one leaves the slot empty, nothing moves
 *
 * It replaces the private eyebrow + stencil h1 + serif lede each page
 * used to carry. The rail above it (RouteRail) and the tabs below it
 * (SectionTabs) stay their own components.
 *
 * `containerClassName` sets the page's own width + gutter, so the header
 * lines up with the grid beneath it.
 */
import type { ReactNode } from "react";

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  containerClassName = "max-w-[1560px] px-4 sm:px-7",
}: {
  eyebrow: string;
  title: string;
  lede: ReactNode;
  action?: ReactNode;
  containerClassName?: string;
}) {
  return (
    <header className={`mx-auto pt-12 ${containerClassName}`}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        {/* basis-[20rem]: below ~20rem of free row the action wraps under
            the intro instead of squeezing it to one or two words per line
            at 375px (M-gr7, UX scan 2026-11-12). */}
        <div className="min-w-0 flex-1 basis-[20rem]">
          <p className="bcc-mono text-bcc-text-safety">{eyebrow}</p>
          <h1
            className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
            style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
          >
            {title}
          </h1>
          <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-bcc-text-secondary">
            {lede}
          </p>
        </div>
        {action !== undefined && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
