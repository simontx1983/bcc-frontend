"use client";

/**
 * TourContext — the tour engine's React context, on its own so that
 * optional chrome (e.g. Members' RankTrustNote) can read the seen-set
 * without importing <TourProvider> and its API layer. TourProvider
 * provides it and re-exports both names; consumers still use useTour.
 */

import { createContext } from "react";

import type { TourDefinition, TourStep } from "@/lib/tour/types";

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
   * Record an id as seen without running a tour. For one-off first-visit
   * notes (e.g. Members' "members-intro"): the same durable seen-set, so a
   * note dismissed on one device stays dismissed on the others.
   */
  markSeen: (tourId: string) => void;
  /**
   * Can `hasSeen` be trusted yet (the server's seen-set has answered for a
   * signed-in viewer)? Auto-start waits on this. See useToursSeen.
   */
  seenReady: boolean;
}

export const TourContext = createContext<TourContextValue | null>(null);
