"use client";

/**
 * useAutoStartTour — fire a contextual tour once, on first visit to the
 * surface that owns it. Drop it into a page/component:
 *
 *   useAutoStartTour("home-feed");
 *
 * Guards, so it never nags:
 *   - skips if the viewer has already seen this tour (local ∪ server);
 *   - skips if another tour is already running;
 *   - waits until the first targeted element is actually in the DOM
 *     (so it doesn't fire on an empty/loading surface), with a short
 *     grace window before giving up;
 *   - fires at most once per mount.
 *
 * Marking-as-seen is owned by the engine (skip/finish), so a tour that
 * auto-starts and is completed or dismissed won't come back.
 */

import { useEffect, useRef } from "react";

import { useTour } from "@/components/tour/useTour";
import { firstVisibleMatch } from "@/lib/tour/dom";
import { tourRegistry } from "@/lib/tour/registry";
import { isSessionDismissed } from "@/lib/tour/storage";

const READY_POLL_MS = 200;
const READY_GIVE_UP_MS = 4000;

export function useAutoStartTour(tourId: string, enabled = true): void {
  const { start, hasSeen, definition } = useTour();
  const firedRef = useRef(false);

  const tourRunning = definition !== null;

  useEffect(() => {
    if (!enabled || firedRef.current) return undefined;
    if (tourRunning) return undefined;
    const def = tourRegistry[tourId];
    if (def === undefined) return undefined;
    // Permanently seen (local ∪ server) OR dismissed for this session.
    if (hasSeen(tourId) || isSessionDismissed(tourId)) return undefined;

    const first = def.steps[0];
    // Center-only first step needs nothing in the DOM — fire immediately.
    if (first?.target === undefined) {
      firedRef.current = true;
      start(tourId);
      return undefined;
    }

    const selector = first.target;
    const started = Date.now();
    let poll: number | undefined;

    const check = () => {
      if (firedRef.current) return;
      if (firstVisibleMatch(selector) !== null) {
        firedRef.current = true;
        start(tourId);
        return;
      }
      if (Date.now() - started > READY_GIVE_UP_MS) return;
      poll = window.setTimeout(check, READY_POLL_MS);
    };
    check();

    return () => {
      if (poll !== undefined) window.clearTimeout(poll);
    };
  }, [tourId, enabled, tourRunning, hasSeen, start]);
}
