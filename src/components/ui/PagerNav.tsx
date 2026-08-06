"use client";

/**
 * PagerNav — the shared PREV / PAGE x / y / NEXT pager.
 *
 * Consolidates three copies of the same chip pager that had already
 * drifted: /members and /mentors each carried a local `Pagination`
 * (identical except /mentors remembered `motion-reduce:transition-none`),
 * and WatchingGrid carried a third, differently-styled footer. This is
 * the /mentors variant — the one that respects reduced motion.
 *
 * Renders nothing below two pages. Disabled chips stay in the layout
 * rather than being hidden so the row doesn't shift when the viewer
 * lands on the first or last page.
 *
 * Presentational: the caller owns page state (URL param or useState)
 * and re-fetches; `isBusy` locks both chips while a page transition is
 * in flight so the viewer can't click ahead of the data.
 */

export interface PagerNavProps {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  /** Locks both chips while a page transition is in flight. */
  isBusy?: boolean;
  /**
   * Overrides the "is there another page" test, which defaults to
   * `page < totalPages`. That default is right whenever `totalPages` is
   * exact. Offset-paged callers whose `total` counts rows the server may
   * drop before rendering — /watching's Watchers tab, where §4.4 skips
   * follow edges pointing at deleted users — pass the server's own
   * `has_more` here instead, so NEXT can't offer a page that resolves
   * empty. The "PAGE x / y" display still reads `totalPages`.
   */
  hasNext?: boolean;
}

const CHIP_CLASS =
  "border-2 border-bcc-border px-3 py-1 transition motion-reduce:transition-none hover:border-bcc-border-strong hover:text-bcc-text disabled:opacity-40";

export function PagerNav({
  page,
  totalPages,
  onPageChange,
  isBusy = false,
  hasNext,
}: PagerNavProps) {
  if (totalPages <= 1) return null;

  const canGoNext = hasNext ?? page < totalPages;

  return (
    <nav
      className="bcc-mono mt-8 flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-bcc-text-secondary"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={isBusy || page <= 1}
        className={CHIP_CLASS}
      >
        ← PREV
      </button>
      <span>
        PAGE {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={isBusy || !canGoNext}
        className={CHIP_CLASS}
      >
        NEXT →
      </button>
    </nav>
  );
}
