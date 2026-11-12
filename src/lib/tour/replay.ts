/**
 * "Show me around" — replay a tour on request (F-322).
 *
 * A tour auto-starts once per account; after that it only comes back when
 * the member asks. The ask comes from the site chrome (the avatar menu and
 * the mobile menu), and SiteHeader is mounted OUTSIDE <TourProvider>, so
 * it cannot call `useTour().start`. It raises this window event instead;
 * TourProvider listens and starts the tour regardless of the seen-set.
 *
 * The caller then navigates to the tour's surface. `start` writes progress
 * to sessionStorage first, so if the navigation remounts the provider (a
 * different route group mounts its own AppShell), the resume effect picks
 * the tour up on arrival.
 */

export const TOUR_REQUEST_EVENT = "bcc:tour-request";

/** The tour "Show me around" replays: the Floor walkthrough. */
export const SHOW_ME_AROUND_TOUR = "home-feed";

/** Where that tour lives. */
export const SHOW_ME_AROUND_HREF = "/";

export function requestTour(tourId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOUR_REQUEST_EVENT, { detail: tourId }));
}
