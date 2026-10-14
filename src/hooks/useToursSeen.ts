"use client";

/**
 * useToursSeen — the reconciled "have I seen this tour?" store.
 *
 * Unions the two persistence layers so they can't collide:
 *
 *   - localStorage (immediate, offline-safe, per-device) via lib/tour/storage
 *   - server user-meta (durable, cross-device) via /me/tours-seen
 *
 * A tour is SEEN iff it's in `localSeen ∪ serverSeen`. Both layers are
 * append-only (nothing ever un-sees a tour), so the union is
 * order-independent and merge-conflict-free. `markSeen` writes localStorage
 * synchronously (the source of truth for the current tab) AND fires the
 * server POST as write-through; if the server endpoint isn't deployed yet
 * (404) or the request fails, we degrade silently to localStorage-only.
 *
 * One instance lives in TourProvider; consumers read through the context.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useViewerScope } from "@/hooks/useViewerScope";
import { getToursSeen, markTourSeen } from "@/lib/api/tours-endpoints";
import type { ToursSeenResponse } from "@/lib/api/types";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import { addLocalSeen, getLocalSeen } from "@/lib/tour/storage";

/**
 * Viewer-scoped, because the server layer is a `/me/*` response.
 *
 * The LOCAL layer has always been scoped — `getLocalSeen(scope)` reads one
 * viewer's set and nobody else's. The server layer was not: it cached under
 * a single constant key, so one viewer's durable seen-set shared a cache
 * entry with the next viewer's and with an anonymous visitor's. The
 * gate/cancel/clear chain in `lib/auth/session-boundary` empties that on a
 * confirmed teardown, and still does — this makes the two layers agree on
 * whose data they hold instead of relying on teardown ordering.
 *
 * `null` (identity unavailable) is a distinct namespace from `ANON_SCOPE`,
 * and the query is disabled there anyway.
 */
function toursSeenKey(scope: ViewerScope) {
  return ["me", "tours-seen", scope] as const;
}

export interface ToursSeenApi {
  hasSeen: (tourId: string) => boolean;
  markSeen: (tourId: string) => void;
}

export function useToursSeen(): ToursSeenApi {
  const queryClient = useQueryClient();
  const scope = useViewerScope();

  // Local layer — seeded from localStorage and bumped on markSeen. The
  // seed is an effect keyed on the scope, not a lazy initial state: at
  // mount we often do not yet know who the viewer is, and the set is read
  // back per viewer, so it has to be re-seeded when that resolves or
  // changes. A viewer who signs in gets THEIR seen-set, never the
  // previous occupant's.
  const [localSeen, setLocalSeen] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  //
  // An UNAVAILABLE scope (a session blip) is not an empty seen-set: wiping
  // it there would make `hasSeen` false mid-session and re-arm tours the
  // viewer has already finished. Hold what is loaded until identity is
  // known again.
  useEffect(() => {
    if (scope === null) return;
    setLocalSeen(new Set(getLocalSeen(scope)));
  }, [scope]);

  // Server layer — degrade to empty on any error (endpoint may not exist
  // yet). No retries or focus refetch: this is a low-stakes preference set.
  //
  // ⚠ GATED on an authenticated session. `GET /me/tours-seen` is
  // Bearer-authed, so for an anonymous visitor it can only ever 401 —
  // and this hook lives in TourProvider, which is mounted on every page.
  // Measured before this change: one guaranteed-401 request on EVERY
  // public page view, anonymous or not, which was 1 of the 3–6 API
  // requests those pages make. Nothing was gained by it: an anonymous
  // viewer has no server-side record to read, and the local layer below
  // already answers `hasSeen` for them.
  //
  // This matches the idiom the rest of the always-mounted chrome already
  // uses — `useBadges` gates on `status === "authenticated"` and
  // `useSuggestedMembers` takes `enabled: isAuthed`. This hook was the
  // only one of them without a gate.
  //
  // `scope !== null` is the second half: with identity unavailable we do
  // not know whose set this would be, so it must not be read or filed.
  const sessionStatus = useSession().status;
  const serverQuery = useQuery<ToursSeenResponse>({
    queryKey: toursSeenKey(scope),
    enabled: sessionStatus === "authenticated" && scope !== null,
    queryFn: ({ signal }) => getToursSeen(signal),
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const serverSeen = useMemo<ReadonlySet<string>>(
    () => new Set(serverQuery.data?.seen ?? []),
    [serverQuery.data],
  );

  const markMutation = useMutation<ToursSeenResponse, unknown, string>({
    mutationFn: (tourId) => markTourSeen(tourId),
    onSuccess: (data) => {
      // Adopt the server's authoritative set when it answers.
      // Into THIS viewer's namespace. With identity unavailable we cannot
      // say whose set it is, so the local layer (already written
      // synchronously by `markSeen`) carries it alone.
      if (scope !== null) {
        queryClient.setQueryData<ToursSeenResponse>(toursSeenKey(scope), data);
      }
    },
    // Swallow errors — localStorage already recorded the "seen", so the
    // tour won't replay on this device regardless of the server outcome.
  });

  const hasSeen = useCallback(
    (tourId: string) => localSeen.has(tourId) || serverSeen.has(tourId),
    [localSeen, serverSeen],
  );

  const markSeen = useCallback(
    (tourId: string) => {
      if (localSeen.has(tourId)) return;
      // With an unknown scope the local write is dropped (see
      // lib/auth/viewer-scope) — the server POST below still records it,
      // so the tour is remembered durably even then.
      addLocalSeen(scope, tourId);
      setLocalSeen((prev) => {
        const next = new Set(prev);
        next.add(tourId);
        return next;
      });
      markMutation.mutate(tourId);
    },
    [localSeen, markMutation, scope],
  );

  return { hasSeen, markSeen };
}
