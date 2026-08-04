"use client";

/**
 * useDisputes — React Query hooks for the dispute system (open
 * community voting — Rank Phase 6).
 *
 * Two flows:
 *
 *   OPEN
 *     - useDisputableVotes(pageId)  — picker data for the OpenDisputeModal
 *     - useOpenDispute()            — POST /disputes mutation
 *     - useMyDisputes()             — the reporter's filed-case list
 *
 *   COMMUNITY VOTE
 *     - useDisputeVote(id)          — the viewer's C10-safe ballot state
 *     - useCastDisputeVote()        — POST /disputes/:id/vote (cast/change)
 *     - useWithdrawDisputeVote()    — DELETE /disputes/:id/vote
 *
 * The ballot mutations invalidate the filed-case list and prime the
 * per-dispute vote cache themselves (the server returns the fresh
 * viewer state); additional side effects stay caller-owned via the
 * standard mutation options. DISPUTABLE_VOTES_QUERY_KEY_ROOT is
 * exported for the OpenDisputeModal's post-file invalidation; the
 * mine/vote roots are module-local because this module owns all their
 * invalidation.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  castDisputeVote,
  getDisputableVotes,
  getDisputeVote,
  getMyDisputes,
  openDispute,
  withdrawDisputeVote,
} from "@/lib/api/disputes-endpoints";
import type {
  BccApiError,
  CastDisputeVoteRequest,
  DisputableVote,
  Dispute,
  DisputeVoteViewerState,
  OpenDisputeRequest,
  OpenDisputeResponse,
} from "@/lib/api/types";

export const DISPUTABLE_VOTES_QUERY_KEY_ROOT = ["disputes", "votes"] as const;
const MY_DISPUTES_QUERY_KEY_ROOT = ["disputes", "mine"] as const;
const DISPUTE_VOTE_QUERY_KEY_ROOT = ["disputes", "vote"] as const;

/**
 * GET /bcc/v1/disputes/votes/:page_id — feeds the OpenDisputeModal's
 * vote picker. Owner-only on the server. Caller MUST gate the query
 * on viewer-owns-page (pass enabled=false otherwise) — the server will
 * 403 a non-owner request and React Query would surface the error
 * as a noisy console message.
 *
 * Stable for 60s — votes don't change often, and the picker is a
 * short-lived modal surface.
 */
export function useDisputableVotes(
  pageId: number,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && pageId > 0;
  return useQuery<DisputableVote[], BccApiError>({
    queryKey: [...DISPUTABLE_VOTES_QUERY_KEY_ROOT, pageId],
    queryFn: ({ signal }) => getDisputableVotes(pageId, signal),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * POST /bcc/v1/disputes — file a dispute. Caller drives invalidation +
 * toast in onSuccess (e.g. invalidate DISPUTABLE_VOTES_QUERY_KEY_ROOT
 * for the page, plus the user's profile USER_DISPUTES_QUERY_KEY_ROOT).
 */
export function useOpenDispute(
  options: Omit<
    UseMutationOptions<OpenDisputeResponse, BccApiError, OpenDisputeRequest>,
    "mutationFn"
  > = {},
) {
  return useMutation<OpenDisputeResponse, BccApiError, OpenDisputeRequest>({
    mutationFn: (request) => openDispute(request),
    ...options,
  });
}

/**
 * GET /bcc/v1/disputes/mine — disputes the viewer filed as a page owner.
 * C10: rows never carry tallies; a reviewing row is status-only and the
 * closed tally lives on the per-dispute vote state.
 *
 * Stable for 30s. Resolution events (poll close / admin action) will
 * lag by up to 30s on this view.
 */
export function useMyDisputes() {
  return useQuery<Dispute[], BccApiError>({
    queryKey: [...MY_DISPUTES_QUERY_KEY_ROOT],
    queryFn: ({ signal }) => getMyDisputes(signal),
    staleTime: 30_000,
  });
}

/**
 * GET /bcc/v1/disputes/:id/vote — the viewer's C10-safe ballot state.
 *
 * OLD-BACKEND TOLERANCE: production may still run the panel-era backend
 * where this route 404s. `retry: false` keeps that a single probe, and
 * on any error `data` stays undefined — consumers render NOTHING for
 * the ballot surface in that case (never fabricate viewer state).
 *
 * Stable for 15s — the state is per-viewer and cheap, but mutations
 * prime the cache directly so a short window is enough.
 */
export function useDisputeVote(
  disputeId: number,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && disputeId > 0;
  return useQuery<DisputeVoteViewerState, BccApiError>({
    queryKey: [...DISPUTE_VOTE_QUERY_KEY_ROOT, disputeId],
    queryFn: ({ signal }) => getDisputeVote(disputeId, signal),
    enabled,
    retry: false,
    staleTime: 15_000,
  });
}

type BallotVariables = { disputeId: number; request: CastDisputeVoteRequest };

/**
 * POST /bcc/v1/disputes/:id/vote — cast, or change the active ballot.
 *
 * Built-in cache upkeep (this hook is the only invalidator of the
 * filed-case list on the ballot path):
 *   - primes the per-dispute vote cache with the returned viewer state
 *   - invalidates MY_DISPUTES_QUERY_KEY_ROOT
 * Caller-supplied onSuccess/onError run after the built-ins.
 */
export function useCastDisputeVote(
  options: Omit<
    UseMutationOptions<DisputeVoteViewerState, BccApiError, BallotVariables>,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();
  return useMutation<DisputeVoteViewerState, BccApiError, BallotVariables>({
    mutationFn: ({ disputeId, request }) => castDisputeVote(disputeId, request),
    ...options,
    onSuccess: (state, variables, onMutateResult, context) => {
      queryClient.setQueryData(
        [...DISPUTE_VOTE_QUERY_KEY_ROOT, variables.disputeId],
        state,
      );
      void queryClient.invalidateQueries({
        queryKey: MY_DISPUTES_QUERY_KEY_ROOT,
      });
      options.onSuccess?.(state, variables, onMutateResult, context);
    },
  });
}

/**
 * DELETE /bcc/v1/disputes/:id/vote — withdraw the active ballot (24h
 * cooldown before re-entry; re-entry consumes recast budget). Same
 * built-in cache upkeep as useCastDisputeVote.
 */
export function useWithdrawDisputeVote(
  options: Omit<
    UseMutationOptions<
      DisputeVoteViewerState,
      BccApiError,
      { disputeId: number }
    >,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();
  return useMutation<
    DisputeVoteViewerState,
    BccApiError,
    { disputeId: number }
  >({
    mutationFn: ({ disputeId }) => withdrawDisputeVote(disputeId),
    ...options,
    onSuccess: (state, variables, onMutateResult, context) => {
      queryClient.setQueryData(
        [...DISPUTE_VOTE_QUERY_KEY_ROOT, variables.disputeId],
        state,
      );
      void queryClient.invalidateQueries({
        queryKey: MY_DISPUTES_QUERY_KEY_ROOT,
      });
      options.onSuccess?.(state, variables, onMutateResult, context);
    },
  });
}
