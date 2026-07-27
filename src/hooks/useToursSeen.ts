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
import { useCallback, useMemo, useState } from "react";

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

  // Local layer — seeded once from localStorage, bumped on markSeen.
  const [localSeen, setLocalSeen] = useState<ReadonlySet<string>>(() => new Set(getLocalSeen()));

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
      addLocalSeen(tourId);
      setLocalSeen((prev) => {
        const next = new Set(prev);
        next.add(tourId);
        return next;
      });
      markMutation.mutate(tourId);
    },
    [localSeen, markMutation],
  );

  return { hasSeen, markSeen };
}
