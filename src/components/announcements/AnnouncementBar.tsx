"use client";

/**
 * The announcement bar — the rotating strip above the validator's tabs.
 *
 * Shows at most five active announcements, one at a time, in the order
 * the server handed them over: pinned first when one exists, then newest
 * first. The client never sorts, never re-ranks, and never rebuilds a
 * link — `links.self` is used verbatim.
 *
 * A slide carries only title, summary, date and a way through. The body
 * and the discussion live on the announcement's own page; duplicating
 * them here would make the bar a second reading surface competing with
 * the canonical one.
 *
 * ## Why rotation is this fussy
 *
 * A strip that moves on its own is an accessibility hazard in three
 * distinct ways, and each needs its own answer:
 *
 *   - **Motion.** Under `prefers-reduced-motion` there is no interval
 *     and no transform — a static first slide, not a faster animation.
 *   - **Control.** Hover and focus pausing does nothing for a touch or
 *     screen-reader user, so an explicit Pause/Resume button is
 *     required, not a nicety (WCAG 2.2.2).
 *   - **Noise.** A polite live region that fires every eight seconds
 *     would read the bar aloud forever. Automatic rotation is therefore
 *     silent (`aria-live="off"`); only a change the viewer asked for
 *     announces.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { humanizeCode } from "@/lib/api/errors";
import { formatAbsoluteDateTime, formatShortDate } from "@/lib/format";
import { ROTATOR_MAX_ITEMS } from "@/lib/api/announcement-endpoints";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useAnnouncementRotator } from "@/hooks/useAnnouncements";
import type { Announcement } from "@/lib/api/types";

/** Contract cadence for automatic advance. */
export const ROTATE_INTERVAL_MS = 8000;

interface AnnouncementBarProps {
  pageId: number;
  /**
   * Presence of the server's announcements block. False → render
   * nothing and issue no request.
   */
  featureEnabled: boolean;
}

export function AnnouncementBar({ pageId, featureEnabled }: AnnouncementBarProps) {
  const query = useAnnouncementRotator(pageId, { enabled: featureEnabled });
  // Drives the TRANSFORM only. The interval reads matchMedia directly
  // (below), because this hook's pre-hydration default would let one
  // frame through before it settled.
  const reducedMotion = usePrefersReducedMotion();

  /**
   * Defensive containment: the server owns the bound, but a server that
   * over-returns must not turn the bar into an endless carousel. Slice
   * WITHOUT reordering — the order is the server's answer, not ours.
   */
  const items: Announcement[] = useMemo(
    () => (query.data?.items ?? []).slice(0, ROTATOR_MAX_ITEMS),
    [query.data],
  );

  // Identity, not position, is what survives a refetch.
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  /** Set only by a viewer-initiated change, so automatic advances stay silent. */
  const [announce, setAnnounce] = useState(false);
  /** Off for one frame after a slide change, so the entry can animate. */
  const [settled, setSettled] = useState(true);

  /**
   * Resolve the index from the id every render. Keeping an index in
   * state instead would silently point at a different announcement after
   * a refetch reordered or dropped one.
   */
  const index = (() => {
    if (currentId === null) return 0;
    const found = items.findIndex((item) => item.id === currentId);
    return found === -1 ? 0 : found;
  })();

  // A refetch that drops the current announcement falls back to the
  // first rather than to a stale id or an out-of-range index.
  useEffect(() => {
    if (items.length === 0) return;
    if (currentId === null || !items.some((item) => item.id === currentId)) {
      setCurrentId(items[0]?.id ?? null);
    }
  }, [items, currentId]);

  /**
   * Nudge the incoming slide up into place. Under reduced motion this
   * never runs, so the slide simply appears — a static state, not a
   * shorter animation.
   */
  useEffect(() => {
    if (reducedMotion) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const frame = window.requestAnimationFrame(() => setSettled(true));
    return () => window.cancelAnimationFrame(frame);
  }, [currentId, reducedMotion]);

  const goTo = useCallback(
    (nextIndex: number, viewerInitiated: boolean) => {
      if (items.length === 0) return;
      const wrapped = (nextIndex + items.length) % items.length;
      setCurrentId(items[wrapped]?.id ?? null);
      if (viewerInitiated) {
        // Manual navigation stops the carousel until the viewer says
        // otherwise, and is the only change worth announcing.
        setPaused(true);
        setAnnounce(true);
      }
    },
    [items],
  );

  const total = items.length;
  const canRotate = total > 1;

  /**
   * The interval.
   *
   * `usePrefersReducedMotion()` resolves AFTER mount, so consulting it
   * here would let one frame of animation through before it settled.
   * Reading matchMedia directly inside the effect closes that window —
   * the same workaround TabRail documents.
   */
  useEffect(() => {
    if (!canRotate || paused || interacting) return;

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const id = window.setInterval(() => {
      setCurrentId((prev) => {
        if (items.length === 0) return prev;
        const at = items.findIndex((item) => item.id === prev);
        const next = (at === -1 ? 0 : at + 1) % items.length;
        return items[next]?.id ?? prev;
      });
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [canRotate, paused, interacting, items]);

  // ── Render gates ───────────────────────────────────────────────────

  // Feature absent: nothing, and the hook never fetched.
  if (!featureEnabled) return null;

  if (query.isError) {
    // Supplementary content — a failure here degrades the bar, never the
    // profile around it.
    const copy = humanizeCode(
      query.error,
      { bcc_rate_limited: "Loading too fast — try again in a moment." },
      "Couldn't load announcements.",
    );
    return (
      <section aria-label="Announcements" className="mx-auto mt-8 max-w-3xl px-4 sm:px-0">
        <LoadFailure message={copy} onRetry={() => void query.refetch()} />
      </section>
    );
  }

  if (query.isPending) {
    return (
      <section aria-label="Announcements" className="mx-auto mt-8 max-w-3xl px-4 sm:px-0">
        <Skeleton className="h-28 w-full" />
      </section>
    );
  }

  // Nothing posted: the bar is absent rather than an empty frame.
  if (total === 0) return null;

  const current = items[index];
  if (current === undefined) return null;

  const positionLabel = `Announcement ${index + 1} of ${total}: ${current.title}`;

  return (
    <section
      aria-label="Announcements"
      className="mx-auto mt-8 max-w-3xl px-4 sm:px-0"
      data-testid="announcement-bar"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={() => setInteracting(false)}
      onTouchStart={() => setInteracting(true)}
    >
      {/*
        The viewport. `overflow-hidden` is what makes the upward slide a
        slide rather than a jump; under reduced motion no transform is
        applied at all, so the clip is inert.
      */}
      <div className="bcc-panel overflow-hidden">
        <div
          data-testid="announcement-slide-track"
          data-animated={reducedMotion ? "false" : "true"}
          style={
            reducedMotion
              ? undefined
              : {
                  transform: `translateY(${settled ? 0 : 16}px)`,
                  opacity: settled ? 1 : 0,
                  transition: "transform 400ms ease-out, opacity 400ms ease-out",
                }
          }
        >
          <AnnouncementSlide announcement={current} />
        </div>
      </div>

      {/*
        Position status, separate from the slide so the slide's own text
        is never duplicated into the live region.

        `off` during automatic rotation: a polite region here would read
        the bar aloud every eight seconds unprompted. It becomes polite
        only for a change the viewer asked for.
      */}
      <div
        aria-live={announce ? "polite" : "off"}
        aria-atomic="true"
        className="sr-only"
        data-testid="announcement-bar-status"
        data-live={announce ? "polite" : "off"}
      >
        {positionLabel}
      </div>

      {/* One item needs no controls — and no way to pause nothing. */}
      {canRotate && (
        <div
          className="mt-3 flex items-center justify-center gap-2"
          data-testid="announcement-bar-controls"
        >
          <BarButton
            label="Previous announcement"
            onClick={() => goTo(index - 1, true)}
          >
            ‹
          </BarButton>

          <BarButton
            label={paused ? "Resume rotation" : "Pause rotation"}
            onClick={() => {
              const next = !paused;
              setPaused(next);
              // Resuming is not a content change, so it should not read
              // out a slide; pausing leaves the position readable.
              setAnnounce(next);
            }}
            pressed={paused}
          >
            {paused ? "▶" : "❚❚"}
          </BarButton>

          <BarButton label="Next announcement" onClick={() => goTo(index + 1, true)}>
            ›
          </BarButton>
        </div>
      )}
    </section>
  );
}

/**
 * One slide: title, summary, date, and the way through. Deliberately not
 * the body and not the discussion — those belong to the announcement's
 * own page, which this links to with the server's own href.
 */
function AnnouncementSlide({ announcement }: { announcement: Announcement }) {
  const { title, summary, published_at, links } = announcement;
  return (
    <div className="px-5 py-5 sm:px-8" data-testid="announcement-slide">
      <p
        className="bcc-mono mb-2 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        ANNOUNCEMENT
      </p>
      <h3 className="bcc-stencil text-bcc-text" style={{ fontSize: "20px", lineHeight: 1.15 }}>
        {title}
      </h3>
      <p
        className="font-serif text-bcc-text-secondary"
        style={{ fontSize: "15px", lineHeight: 1.5, marginTop: "6px" }}
      >
        {summary}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {published_at !== null && (
          <time
            dateTime={published_at}
            title={formatAbsoluteDateTime(published_at)}
            className="bcc-mono text-bcc-text-secondary"
            style={{ fontSize: "11px" }}
          >
            {formatShortDate(published_at)}
          </time>
        )}
        {/* The server's href, verbatim. Never reconstructed from an id. */}
        <Link
          href={links.self as Route}
          className="bcc-mono inline-flex items-center rounded-sm border border-bcc-border px-4 text-bcc-text"
          style={{ minHeight: "44px", fontSize: "11px", letterSpacing: "0.12em" }}
          data-testid="announcement-read-more"
        >
          READ MORE
        </Link>
      </div>
    </div>
  );
}

/**
 * A bar control. 44×44 because these are primary controls — the 36px
 * compact exception is for dense repeated chrome, which this is not.
 * No focus ring here: the global `:focus-visible` treatment owns that.
 */
function BarButton({
  label,
  onClick,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      className="bcc-mono inline-flex items-center justify-center rounded-sm border border-bcc-border text-bcc-text"
      style={{ minWidth: "44px", minHeight: "44px", fontSize: "12px" }}
    >
      <span aria-hidden>{children}</span>
    </button>
  );
}
