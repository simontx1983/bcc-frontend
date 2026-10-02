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
import { useCallback, useEffect, useMemo, useState } from "react";

import { useViewerScope } from "@/hooks/useViewerScope";
import { getToursSeen, markTourSeen } from "@/lib/api/tours-endpoints";
import type { ToursSeenResponse } from "@/lib/api/types";
import { addLocalSeen, getLocalSeen } from "@/lib/tour/storage";

const TOURS_SEEN_KEY = ["me", "tours-seen"] as const;

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
  useEffect(() => {
    setLocalSeen(new Set(getLocalSeen(scope)));
  }, [scope]);

  // Server layer — degrade to empty on any error (endpoint may not exist
  // yet). No retries or focus refetch: this is a low-stakes preference set.
  const serverQuery = useQuery<ToursSeenResponse>({
    queryKey: TOURS_SEEN_KEY,
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
      queryClient.setQueryData<ToursSeenResponse>(TOURS_SEEN_KEY, data);
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
