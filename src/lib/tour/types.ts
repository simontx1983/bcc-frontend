/**
 * Reusable tour / coachmark engine — shared types.
 *
 * A "tour" is an ordered sequence of steps. Each step points at a real
 * element via a stable `data-bcc-tour="feature.name"` selector (targets
 * describe WHAT an element is, not where it sits in a tour, so the same
 * target is reusable across tours, hints, and announcements). The engine
 * (TourProvider + TourLayer) knows nothing about any specific feature —
 * it renders whatever the registry hands it.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface TourStep {
  /**
   * CSS selector for the target element. Convention:
   * `[data-bcc-tour="feature.name"]`. Omit + set `center: true` for an
   * untethered intro/outro card.
   */
  target?: string;
  title: string;
  body: string;
  /** Preferred popover side relative to the target. Default "auto". */
  placement?: TourPlacement;
  /**
   * Route that must be active for this step. If the current path doesn't
   * match, the engine navigates there first, then resumes on arrival.
   */
  route?: string;
  /** Extra px of spotlight breathing room around the target rect. */
  padding?: number;
  /** Render a centered card with a dimmed backdrop, no spotlight. */
  center?: boolean;
}

export interface TourDefinition {
  /** Stable id — also the persistence key. Kebab-case, e.g. "home-feed". */
  id: string;
  /** Human label for replay menus ("Show me around"). */
  label: string;
  steps: TourStep[];
}

export type TourId = string;
