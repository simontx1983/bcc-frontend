/**
 * Typed wrappers for the dispute-system endpoints (§D5 V1 Phase 5).
 *
 * Two flows live here:
 *
 *   OPEN flow (page owner)
 *   ──────────────────────
 *   - GET  /bcc/v1/disputes/votes/:page_id  → list disputable votes
 *   - POST /bcc/v1/disputes                 → file a new dispute
 *
 *   PANEL flow (selected jurors)
 *   ────────────────────────────
 *   - GET  /bcc/v1/disputes/panel           → my pending queue
 *   - POST /bcc/v1/disputes/:id/vote        → cast accept / reject
 *
 * The historical /users/:handle/disputes read endpoint is wrapped in
 * user-activity-endpoints.ts as `getUserDisputes` — it powers the
 * profile DisputesPanel and stays untouched here.
 *
 * All four routes require auth (Bearer JWT attached by bccFetchAsClient).
 * Server-side eligibility:
 *   - OPEN: only the page owner; only downvotes; one active dispute per
 *     vote; per-page + per-reporter rate-limit; throttled 60s on submit.
 *   - PANEL: only assigned panelists for that dispute id.
 *
 * Common error codes the UI should map to copy:
 *   - bcc_unauthorized              → no session
 *   - dispute_subsystem_unhealthy   → backend constraint missing (503)
 *   - vote_not_found                → bad vote_id (404)
 *   - not_page_owner                → 403; UI should never show this
 *                                     because the button is gated
 *   - cannot_self_dispute           → defensive; same as above
 *   - upvote_not_disputable         → picker should disable upvotes
 *   - already_disputed              → vote already has an active dispute
 *   - insufficient_panelists        → community too small right now
 *   - dispute_limit_reached         → page hit its dispute cap
 *   - reporter_limit_reached        → user hit their reporter cap
 *   - vote_no_longer_active         → vote was removed mid-flow
 *   - db_transient                  → retry recommended
 *   - not_assigned                  → panelist tried to vote on a
 *                                     dispute they aren't on
 *   - already_voted                 → panelist already cast their vote
 *   - dispute_closed                → dispute resolved before vote landed
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CastPanelVoteRequest,
  CastPanelVoteResponse,
  DisputableVote,
  MyParticipationStatus,
  OpenDisputeRequest,
  OpenDisputeResponse,
  PanelDispute,
} from "@/lib/api/types";

/**
 * GET /bcc/v1/disputes/votes/:page_id — list every active vote on the
 * page so the owner can pick which downvote to dispute. Returns a flat
 * array; pagination headers (X-WP-Total / X-WP-TotalPages) are present
 * but not surfaced here — V1 only fetches the first 50, which covers
 * any realistic page (downvotes are rare).
 *
 * Owner-only. Caller should ensure the viewer owns the page before
 * mounting; the server returns 403 otherwise.
 */
export function getDisputableVotes(
  pageId: number,
  signal?: AbortSignal,
): Promise<DisputableVote[]> {
  return bccFetchAsClient<DisputableVote[]>(`disputes/votes/${pageId}`, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /bcc/v1/disputes — file a dispute against a downvote. Server
 * picks DISPUTE_PANEL_SIZE panelists atomically and queues per-panelist
 * notifications.
 *
 * The 60s throttle is tracked server-side per user; clients SHOULD
 * disable the submit button during the in-flight request rather than
 * trying to gate locally.
 */
export function openDispute(
  request: OpenDisputeRequest,
): Promise<OpenDisputeResponse> {
  return bccFetchAsClient<OpenDisputeResponse>("disputes", {
    method: "POST",
    body: request,
  });
}

/**
 * GET /bcc/v1/disputes/panel — the viewer's panel queue. Empty array
 * when the viewer isn't currently selected for any panel. The server
 * pre-filters to disputes still in `reviewing` status; resolved rows
 * fall off the queue automatically.
 *
 * Note: vote tallies + reporter identity are intentionally hidden from
 * panelists during deliberation (per the controller's privacy contract).
 * The UI must not treat 0 accepts / empty reporter_name as ground truth.
 */
export function getPanelQueue(
  signal?: AbortSignal,
): Promise<PanelDispute[]> {
  return bccFetchAsClient<PanelDispute[]>("disputes/panel", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /bcc/v1/disputes/:id/vote — cast a panel vote. The 10s throttle
 * is server-enforced; the response intentionally omits running tallies
 * (independent-deliberation rule). On success, refetch the panel queue
 * to update `my_decision` on the row.
 *
 * The response includes a `participation` block describing whether the
 * vote earned a §D5 credit and the post-vote daily/lifetime counts.
 * Safe to surface immediately — it's the panelist's own state, not a
 * leak of the dispute tally.
 */
export function castPanelVote(
  disputeId: number,
  request: CastPanelVoteRequest,
): Promise<CastPanelVoteResponse> {
  return bccFetchAsClient<CastPanelVoteResponse>(
    `disputes/${disputeId}/vote`,
    {
      method: "POST",
      body: request,
    },
  );
}

/**
 * GET /bcc/v1/disputes/mine — disputes the viewer has filed (page-owner
 * view). Returns the same `formatDispute` shape as the panel queue, so
 * we reuse `PanelDispute` as the response type — note that `my_decision`
 * is always null on this endpoint (the reporter isn't a panelist on
 * their own dispute).
 *
 * V1: returns the first page (default 20). When the user passes a real
 * pagination story, swap this for the paginated form.
 */
export function getMyDisputes(
  signal?: AbortSignal,
): Promise<PanelDispute[]> {
  return bccFetchAsClient<PanelDispute[]>("disputes/mine", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * GET /bcc/v1/disputes/participation/me — viewer's own §D5 participation
 * status. Drives the /panel header progress indicator. Caps come back
 * in the response so the frontend never has to mirror the backend
 * constants.
 *
 * Auth-only. The server returns zeros for users who have never been on
 * a panel, never throws.
 */
export function getMyParticipation(
  signal?: AbortSignal,
): Promise<MyParticipationStatus> {
  return bccFetchAsClient<MyParticipationStatus>("disputes/participation/me", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
