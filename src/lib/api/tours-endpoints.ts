/**
 * Typed wrappers for /me/tours-seen — the server half of the tour "seen"
 * store (bcc-trust `MeToursSeenEndpoint`, v1.2.31+). Idempotent by design:
 * POST adds one id, GET returns the full set. Callers (useToursSeen)
 * degrade to localStorage-only on any error, so an older backend without
 * this endpoint is a silent no-op, not a broken app.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { ToursSeenResponse } from "@/lib/api/types";

/** GET /me/tours-seen → { seen: string[] } */
export function getToursSeen(signal?: AbortSignal): Promise<ToursSeenResponse> {
  return bccFetchAsClient<ToursSeenResponse>("me/tours-seen", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/** POST /me/tours-seen { tour_id } → { seen: string[] } (idempotent add). */
export function markTourSeen(tourId: string): Promise<ToursSeenResponse> {
  return bccFetchAsClient<ToursSeenResponse>("me/tours-seen", {
    method: "POST",
    body: { tour_id: tourId },
  });
}
