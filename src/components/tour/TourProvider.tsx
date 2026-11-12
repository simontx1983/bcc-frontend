"use client";

/**
 * TourProvider — the tour engine's brain. Holds the active tour + step,
 * exposes start/next/back/skip/finish, handles cross-page navigation, and
 * owns the reconciled "seen" store (useToursSeen). Mounted once high in
 * the authed app tree; <TourLayer/> (rendered here) draws the overlay.
 *
 * Design notes:
 *   - Progress is mirrored to sessionStorage so a step that changes route
 *     survives the navigation and resumes on arrival.
 *   - "skip" and "finish" both mark the tour SEEN (a user who dismisses a
 *     tour doesn't want it back) — the only difference is intent/telemetry.
 *   - The engine never derives feature logic; it renders whatever the
 *     registry hands it.
 */

import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TourLayer } from "@/components/tour/TourLayer";
import { useToursSeen } from "@/hooks/useToursSeen";
import { useViewerScope } from "@/hooks/useViewerScope";
import { tourRegistry } from "@/lib/tour/registry";
import { TOUR_REQUEST_EVENT } from "@/lib/tour/replay";
import { addSessionDismissed, clearLocalSeen, clearProgress, getProgress, setProgress } from "@/lib/tour/storage";
import type { TourDefinition, TourStep } from "@/lib/tour/types";

interface ActiveTour {
  tourId: string;
  step: number;
}

export interface TourContextValue {
  /** The running tour's definition, or null when idle. */
  definition: TourDefinition | null;
  /** Current step definition, or null when idle. */
  stepDef: TourStep | null;
  stepIndex: number;
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  /** Start a tour by id (no-op if the id is unknown). */
  start: (tourId: string) => void;
  next: () => void;
  back: () => void;
  /** Dismiss permanently ("don't show again") — marks the tour seen. */
  skip: () => void;
  /** Dismiss for this session only — eligible to auto-start again next session. */
  dismissForSession: () => void;
  /** Finish normally — marks the tour seen. */
  finish: () => void;
  /** Has the viewer already seen this tour (local ∪ server)? */
  hasSeen: (tourId: string) => boolean;
  /**
   * Can `hasSeen` be trusted yet (the server's seen-set has answered for a
   * signed-in viewer)? Auto-start waits on this. See useToursSeen.
   */
  seenReady: boolean;
}

export const TourContext = createContext<TourContextValue | null>(null);

function routeMatches(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(route + "/");
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasSeen, markSeen, ready: seenReady } = useToursSeen();
  const scope = useViewerScope();

  const [active, setActive] = useState<ActiveTour | null>(null);

  // Resume an in-flight tour after a cross-page navigation (progress was
  // written to sessionStorage before the route changed). Runs once per
  // document, but not until we know whose progress to read — so the effect
  // is keyed on the scope and latches, rather than running at mount when
  // the scope is still unknown and the read would find nothing. Also
  // honours ?bcc_reset_tours=1 — a dev/testing escape hatch (mirrors the
  // old WP `bcc_reset` tools) that clears the local seen-set + progress so
  // first-visit tours fire again.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (scope === null || resumedRef.current) return;
    resumedRef.current = true;
    if (typeof window !== "undefined" && window.location.search.includes("bcc_reset_tours")) {
      clearLocalSeen(scope);
      clearProgress(scope);
      return;
    }
    const saved = getProgress(scope);
    if (saved !== null && tourRegistry[saved.tourId] !== undefined) {
      setActive({ tourId: saved.tourId, step: saved.step });
    }
  }, [scope]);

  const definition = active !== null ? tourRegistry[active.tourId] ?? null : null;
  const stepIndex = active?.step ?? 0;
  const stepDef =
    definition !== null ? definition.steps[stepIndex] ?? null : null;
  const totalSteps = definition?.steps.length ?? 0;

  const close = useCallback(() => {
    setActive(null);
    clearProgress(scope);
  }, [scope]);

  const start = useCallback((tourId: string) => {
    const def = tourRegistry[tourId];
    if (def === undefined || def.steps.length === 0) return;
    const next: ActiveTour = { tourId, step: 0 };
    setActive(next);
    setProgress(scope, next);
  }, [scope]);

  // "Show me around" (lib/tour/replay): the chrome that offers it sits
  // outside this provider, so it asks by event. An explicit request
  // ignores the seen-set — that is the whole point of the button.
  useEffect(() => {
    const onRequest = (e: Event) => {
      const tourId = (e as CustomEvent<unknown>).detail;
      if (typeof tourId === "string") start(tourId);
    };
    window.addEventListener(TOUR_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(TOUR_REQUEST_EVENT, onRequest);
  }, [start]);

  const goTo = useCallback(
    (index: number) => {
      setActive((prev) => {
        if (prev === null) return prev;
        const def = tourRegistry[prev.tourId];
        if (def === undefined) return prev;
        const clamped = Math.max(0, Math.min(index, def.steps.length - 1));
        const next = { ...prev, step: clamped };
        setProgress(scope, next);
        return next;
      });
    },
    [scope],
  );

  const finish = useCallback(() => {
    if (active !== null) markSeen(active.tourId);
    close();
  }, [active, markSeen, close]);

  const skip = useCallback(() => {
    if (active !== null) markSeen(active.tourId);
    close();
  }, [active, markSeen, close]);

  const dismissForSession = useCallback(() => {
    if (active !== null) addSessionDismissed(scope, active.tourId);
    close();
  }, [active, close, scope]);

  const next = useCallback(() => {
    if (active === null || definition === null) return;
    if (active.step >= definition.steps.length - 1) {
      finish();
      return;
    }
    goTo(active.step + 1);
  }, [active, definition, goTo, finish]);

  const back = useCallback(() => {
    if (active === null) return;
    goTo(active.step - 1);
  }, [active, goTo]);

  // Cross-page navigation: if the current step wants a different route,
  // push there. Progress is already in sessionStorage, so the resume
  // effect re-hydrates `active` after the navigation.
  useEffect(() => {
    if (stepDef?.route === undefined) return;
    if (!routeMatches(pathname, stepDef.route)) {
      router.push(stepDef.route as Route);
    }
  }, [stepDef, pathname, router]);

  const value = useMemo<TourContextValue>(
    () => ({
      definition,
      stepDef,
      stepIndex,
      totalSteps,
      isFirst: stepIndex === 0,
      isLast: stepIndex === totalSteps - 1,
      start,
      next,
      back,
      skip,
      dismissForSession,
      finish,
      hasSeen,
      seenReady,
    }),
    [definition, stepDef, stepIndex, totalSteps, start, next, back, skip, dismissForSession, finish, hasSeen, seenReady],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourLayer />
    </TourContext.Provider>
  );
}
