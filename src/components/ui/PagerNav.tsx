"use client";

/**
 * PagerNav — the shared PREV / PAGE x / y / NEXT pager.
 *
 * Consolidates copies of the same chip pager that had already drifted:
 * /members and /mentors each carried a local `Pagination` (identical
 * except /mentors remembered `motion-reduce:transition-none`), WatchingGrid
 * carried a third, differently-styled footer, and /messages carried a
 * fourth — now also routed through here, because it had the same focus
 * defect described below. This is the /mentors variant, the one that
 * respects reduced motion.
 *
 * Renders nothing below two pages. Unavailable chips stay in the layout
 * rather than being hidden so the row doesn't shift when the viewer lands
 * on the first or last page.
 *
 * Presentational: the caller owns page state (URL param or useState) and
 * re-fetches; `isBusy` marks a page transition in flight.
 *
 * ## Why no chip is ever `disabled`
 *
 * The HTML `disabled` attribute removes an element from the tab order,
 * and the browser BLURS it on the spot. So disabling the chip the viewer
 * just activated drops focus to `<body>` — measured on every consumer of
 * this component: after pressing NEXT, `document.activeElement` was
 * `<body>`, and the keyboard user had to tab in from the top of the
 * document to reach the pager again. It happens two ways:
 *
 *   - `isBusy` goes true while the next page is in flight, so the chip
 *     just pressed is disabled mid-interaction;
 *   - stepping onto the last page disables NEXT, and onto the first
 *     disables PREV.
 *
 * Both are states the viewer reaches BY USING the control, which is the
 * worst time to take focus away from it.
 *
 * So the chips stay focusable and carry `aria-disabled` instead, which
 * conveys unavailability to assistive technology without removing the
 * element from the tab order, and activation is ignored while they are
 * unavailable. Focus simply stays where the viewer put it.
 *
 * ## Why there is also a request latch
 *
 * `isBusy` cannot stop a double-press on its own: it is driven by a
 * query's `isFetching`, which only turns true after the caller's state
 * change has propagated, leaving a window in which a second press is
 * still accepted. Measured on the profile-boundary Retry, which has the
 * same shape, three rapid presses produced four upstream reads.
 *
 * The latch records the page last ASKED for and ignores a repeat request
 * for that same page until `page` catches up. A genuine second step still
 * works — once `page` reads 2, NEXT targets 3, which is a different
 * request.
 */

import { useCallback, useEffect, useRef } from "react";

export interface PagerNavProps {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  /** Marks a page transition in flight. Never disables a chip — see above. */
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

/**
 * Geometry matches the sanctioned compact chip, not the primary-control
 * size. `bcc-frontend/CLAUDE.md` names this control directly:
 *
 *   "36px is the sanctioned compact exception for established dense
 *    repeated controls — filter chips, tag chips, pager chips
 *    (`min-h-[36px]`, canonically `FilterChipRow`)."
 *
 * These chips carried no `min-h` and `py-1`, which with 11px text lands at
 * 30px — measured at exactly 86x30 on /watching and /messages at 375px.
 * `min-h-[36px]` plus the canonical `py-1.5` brings them onto the house
 * size. `inline-flex items-center` is what makes the min-height center the
 * label rather than just grow the box, same as `ModerationQueue`'s chips.
 *
 * Both chips share one class string on purpose: they must stay the same
 * height as each other, or the row shifts when one becomes unavailable —
 * which is the reason unavailable chips are kept in the layout at all.
 */
const CHIP_CLASS =
  "bcc-mono inline-flex min-h-[36px] items-center border-2 border-bcc-border px-3 py-1.5 transition motion-reduce:transition-none hover:border-bcc-border-strong hover:text-bcc-text";

/** Matches the previous `disabled:opacity-40`, now keyed on availability. */
const CHIP_UNAVAILABLE = " opacity-40";

export function PagerNav({
  page,
  totalPages,
  onPageChange,
  isBusy = false,
  hasNext,
}: PagerNavProps) {
  // The page last asked for, cleared once `page` reports it. A ref, not
  // state: it must not itself cause a render, and it is read and written
  // inside the same event.
  const requested = useRef<number | null>(null);
  useEffect(() => {
    if (requested.current === page) requested.current = null;
  }, [page]);

  const request = useCallback(
    (next: number, available: boolean) => {
      // Unavailable chips are focusable but inert — no navigation, and
      // nothing announced beyond `aria-disabled`.
      if (!available || isBusy) return;
      if (requested.current === next) return;
      requested.current = next;
      onPageChange(next);
    },
    [isBusy, onPageChange],
  );

  if (totalPages <= 1) return null;

  const canGoNext = hasNext ?? page < totalPages;
  const prevAvailable = page > 1 && !isBusy;
  const nextAvailable = canGoNext && !isBusy;

  return (
    <nav
      className="bcc-mono mt-8 flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-bcc-text-secondary"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => request(Math.max(1, page - 1), page > 1)}
        aria-disabled={!prevAvailable || undefined}
        aria-busy={isBusy || undefined}
        className={CHIP_CLASS + (prevAvailable ? "" : CHIP_UNAVAILABLE)}
      >
        ← PREV
      </button>
      <span>
        PAGE {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => request(page + 1, canGoNext)}
        aria-disabled={!nextAvailable || undefined}
        aria-busy={isBusy || undefined}
        className={CHIP_CLASS + (nextAvailable ? "" : CHIP_UNAVAILABLE)}
      >
        NEXT →
      </button>
    </nav>
  );
}
