/**
 * Typed wrappers for /me/tours-seen — the server half of the tour "seen"
 * store. Idempotent by design: POST adds one id, GET returns the full set.
 *
 * The backend endpoint ships AFTER this frontend (see
 * HANDOVER / plan Part 2.5). Until it lands both calls will 404; callers
 * (useToursSeen) are built to degrade to localStorage-only on any error,
 * so a missing endpoint is a silent no-op, not a broken app.
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
