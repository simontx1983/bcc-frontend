"use client";

/**
 * useDisputes — React Query hooks for the §D5 dispute system.
 *
 * Two flows, four hooks:
 *
 *   OPEN
 *     - useDisputableVotes(pageId)  — picker data for the OpenDisputeModal
 *     - useOpenDispute()            — POST /disputes mutation
 *
 *   PANEL
 *     - usePanelQueue()             — viewer's pending panel assignments
 *     - useCastPanelVote()          — POST /disputes/:id/vote mutation
 *
 * Invalidation is left to callers (matches useReportContent's pattern).
 * The query-key roots are exported so callers can target them precisely:
 *
 *   - DISPUTABLE_VOTES_QUERY_KEY_ROOT — refresh after opening a dispute
 *   - PANEL_QUEUE_QUERY_KEY_ROOT      — refresh after casting a panel vote
 *   - USER_DISPUTES_QUERY_KEY_ROOT    — refresh user's profile dispute tab
 *     (re-exported from useUserActivity so callers can do all the
 *      invalidation in one place without juggling import paths)
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  castPanelVote,
  getDisputableVotes,
  getMyDisputes,
  getMyParticipation,
  getPanelQueue,
  openDispute,
} from "@/lib/api/disputes-endpoints";
import type {
  BccApiError,
  CastPanelVoteRequest,
  CastPanelVoteResponse,
  DisputableVote,
  MyParticipationStatus,
  OpenDisputeRequest,
  OpenDisputeResponse,
  PanelDispute,
} from "@/lib/api/types";

export const DISPUTABLE_VOTES_QUERY_KEY_ROOT = ["disputes", "votes"] as const;
export const PANEL_QUEUE_QUERY_KEY_ROOT = ["disputes", "panel"] as const;
export const MY_DISPUTES_QUERY_KEY_ROOT = ["disputes", "mine"] as const;
export const MY_PARTICIPATION_QUERY_KEY = ["disputes", "participation", "me"] as const;

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
 * GET /bcc/v1/disputes/panel — the viewer's pending panel assignments.
 * Returns empty array when the viewer isn't on any active panel.
 *
 * Stable for 30s — the queue can move when the cron resolves a
 * stalled-quorum dispute; we don't want the panelist staring at a
 * stale row for long.
 */
export function usePanelQueue() {
  return useQuery<PanelDispute[], BccApiError>({
    queryKey: [...PANEL_QUEUE_QUERY_KEY_ROOT],
    queryFn: ({ signal }) => getPanelQueue(signal),
    staleTime: 30_000,
  });
}

/**
 * POST /bcc/v1/disputes/:id/vote — cast accept / reject. Caller drives
 * invalidation: invalidate PANEL_QUEUE_QUERY_KEY_ROOT to flip the row's
 * `my_decision` field. The server response intentionally hides tallies
 * to enforce independent deliberation; rely on the next queue fetch to
 * surface state changes.
 */
export function useCastPanelVote(
  options: Omit<
    UseMutationOptions<
      CastPanelVoteResponse,
      BccApiError,
      { disputeId: number; request: CastPanelVoteRequest }
    >,
    "mutationFn"
  > = {},
) {
  return useMutation<
    CastPanelVoteResponse,
    BccApiError,
    { disputeId: number; request: CastPanelVoteRequest }
  >({
    mutationFn: ({ disputeId, request }) => castPanelVote(disputeId, request),
    ...options,
  });
}

/**
 * GET /bcc/v1/disputes/mine — disputes the viewer filed as a page owner.
 * Returns the same `PanelDispute` shape as the panel queue endpoint, but
 * `my_decision` is always null (the reporter isn't a panelist on their
 * own dispute) and tallies are visible (no panelist privacy redaction).
 *
 * Stable for 30s — same window as the panel queue. Resolution events
 * (cron-driven) will lag by up to 30s on this view.
 */
export function useMyDisputes() {
  return useQuery<PanelDispute[], BccApiError>({
    queryKey: [...MY_DISPUTES_QUERY_KEY_ROOT],
    queryFn: ({ signal }) => getMyDisputes(signal),
    staleTime: 30_000,
  });
}

/**
 * GET /bcc/v1/disputes/participation/me — viewer's own §D5 participation
 * status. Powers the /panel header indicator and any "X / Y trust
 * earned" stats. Caps come along inside the response so callers don't
 * mirror backend constants.
 *
 * Stable for 30s — the queue page re-fetches on success of each
 * panel vote anyway, so a long staleTime is fine.
 */
export function useMyParticipation(options: { enabled?: boolean } = {}) {
  return useQuery<MyParticipationStatus, BccApiError>({
    queryKey: MY_PARTICIPATION_QUERY_KEY,
    queryFn: ({ signal }) => getMyParticipation(signal),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}
