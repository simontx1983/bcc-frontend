"use client";

/**
 * CelebrationGate — orchestrates §O1.2 Heavy celebration delivery.
 *
 * Responsibilities:
 *   1. Poll /me/celebrations/pending on a slow cadence + window focus
 *      so a celebration that lands while the tab is open eventually
 *      surfaces. The endpoint is cheap (single user-meta read).
 *   2. When the response carries a celebration, render <CelebrationToast>.
 *   3. After the toast's animation completes, fire /me/celebrations/consume
 *      to clear the stash, then invalidate the pending query so a fresh
 *      fetch reflects "nothing pending."
 *
 * Lifecycle separation rationale:
 *   - The toast is presentation-only: it gets `celebration` + `onComplete`.
 *   - The gate owns "is anything pending right now?" + "have we shown it?"
 *   - This keeps the toast trivially testable in isolation without
 *     mocking React Query.
 *
 * Auth gating: the component only mounts the query / toast when a
 * NextAuth session exists. Anonymous viewers never have pending
 * celebrations — calling /me/celebrations/pending without a session
 * returns 401, which would otherwise trigger the auto-signOut branch
 * of bccFetchAsClient and create a bad UX.
 *
 * Cadence: 60s poll. Heavy moments (rank-up, level-up, tier-upgrade)
 * are rare events — once per user per major progression milestone.
 * A faster poll would burn requests for nothing; a slower poll would
 * make the celebration feel laggy after the activity that triggered
 * it. 60s + window-focus refetch hits the right spot.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { CelebrationToast } from "@/components/celebration/CelebrationToast";
import {
  consumeCelebration,
  getPendingCelebration,
} from "@/lib/api/celebrations-endpoints";
import type {
  Celebration,
  PendingCelebrationResponse,
} from "@/lib/api/types";

const PENDING_QUERY_KEY = ["me", "celebrations", "pending"] as const;
const POLL_INTERVAL_MS = 60_000;

export function CelebrationGate() {
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  const queryClient = useQueryClient();

  // Tracks the currently-displaying celebration. Decoupled from the
  // query data so we don't re-render the toast if the query refetches
  // mid-animation.
  const [active, setActive] = useState<Celebration | null>(null);

  const query = useQuery<PendingCelebrationResponse>({
    queryKey: PENDING_QUERY_KEY,
    queryFn: ({ signal }) => getPendingCelebration(signal),
    enabled: isAuthed,
    staleTime: POLL_INTERVAL_MS / 2,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const consumeMutation = useMutation({
    mutationFn: consumeCelebration,
    onSettled: () => {
      // Whether the consume succeeded or not, refresh the pending
      // query — on failure the next fetch will re-deliver the same
      // celebration; on success it'll come back null.
      void queryClient.invalidateQueries({ queryKey: PENDING_QUERY_KEY });
    },
  });

  // Promote a freshly-fetched celebration into the active slot. Only
  // fires when there's no active celebration AND something is pending —
  // that prevents a refetch from interrupting an animation in flight.
  useEffect(() => {
    if (!isAuthed || active !== null) {
      return;
    }
    const incoming = query.data?.celebration ?? null;
    if (incoming !== null) {
      setActive(incoming);
    }
  }, [isAuthed, active, query.data]);

  if (!isAuthed || active === null) {
    return null;
  }

  return (
    <CelebrationToast
      celebration={active}
      onComplete={() => {
        setActive(null);
        consumeMutation.mutate();
      }}
    />
  );
}
