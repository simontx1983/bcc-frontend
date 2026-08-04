/**
 * Typed wrappers for the dispute-system endpoints (open community
 * voting — Rank Phase 6, contract v1.60).
 *
 * Two flows live here:
 *
 *   OPEN flow (page owner)
 *   ──────────────────────
 *   - GET  /bcc/v1/disputes/votes/:page_id  → list disputable votes
 *   - POST /bcc/v1/disputes                 → file a new dispute
 *   - GET  /bcc/v1/disputes/mine            → disputes the viewer filed
 *
 *   COMMUNITY VOTE flow (eligible members)
 *   ──────────────────────────────────────
 *   - POST   /bcc/v1/disputes/:id/vote      → cast (or change) a ballot
 *   - DELETE /bcc/v1/disputes/:id/vote      → withdraw the active ballot
 *   - GET    /bcc/v1/disputes/:id/vote      → the viewer's C10-safe state
 *
 * The historical /users/:handle/disputes read endpoint is wrapped in
 * user-activity-endpoints.ts as `getUserDisputes` — it powers the
 * profile DisputesPanel and stays untouched here.
 *
 * All routes require auth (Bearer JWT attached by bccFetchAsClient).
 * Server-side eligibility:
 *   - OPEN: only the page owner; only downvotes; one active dispute per
 *     vote; per-page + per-reporter rate-limit; throttled 60s on submit.
 *   - VOTE: Apprentice+ rank, Neutral+ trust standing, not a party to
 *     the dispute, no fraud hard-block. All server-enforced — the UI
 *     never precomputes eligibility; it maps the deny codes to copy.
 *
 * Error codes the UI should map to copy (submit flow):
 *   - bcc_unauthorized              → no session
 *   - dispute_subsystem_unhealthy   → backend constraint missing (503)
 *   - vote_not_found                → bad vote_id (404)
 *   - not_page_owner                → 403; UI should never show this
 *                                     because the button is gated
 *   - cannot_self_dispute           → defensive; same as above
 *   - upvote_not_disputable         → picker should disable upvotes
 *   - already_disputed              → vote already has an active dispute
 *   - dispute_limit_reached         → page hit its dispute cap
 *   - reporter_limit_reached        → user hit their reporter cap
 *   - vote_no_longer_active         → vote was removed mid-flow
 *   - db_transient                  → retry recommended
 *   - rate_limited                  → 60s submit throttle
 *
 * Ballot flow (`bcc_dispute_vote_*`, from DisputeController::disputeVoteError):
 *   - bcc_dispute_vote_forbidden        → 403; `data.reason` carries the
 *     deny code: not_authenticated | suspended | rank_required |
 *     tier_required | party_to_dispute | party_check_unavailable |
 *     fraud_blocked
 *   - bcc_dispute_vote_recast_exhausted → 409; change/withdraw budget spent
 *   - bcc_dispute_vote_cooldown         → 429; 24h post-withdraw cooldown
 *   - bcc_dispute_vote_not_found        → 404; dispute or ballot missing
 *   - bcc_dispute_vote_closed           → 410; dispute resolved / poll closed
 *   - rate_limited                      → 10s mutation throttle
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CastDisputeVoteRequest,
  DisputableVote,
  Dispute,
  DisputeVoteViewerState,
  OpenDisputeRequest,
  OpenDisputeResponse,
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
 * POST /bcc/v1/disputes — file a dispute against a downvote. The server
 * opens the community vote on the case and notifies the disputed voter.
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
 * GET /bcc/v1/disputes/mine — disputes the viewer has filed (page-owner
 * view). C10: rows carry NO tallies at any status — the closed tally
 * lives exclusively on GET /disputes/{id}/vote.
 *
 * V1: returns the first page (default 20). When the user passes a real
 * pagination story, swap this for the paginated form.
 */
export function getMyDisputes(signal?: AbortSignal): Promise<Dispute[]> {
  return bccFetchAsClient<Dispute[]>("disputes/mine", {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/**
 * POST /bcc/v1/disputes/:id/vote — cast a ballot, or change it when the
 * viewer already has an active one (same-choice re-submit is an
 * idempotent no-op). Returns the refreshed viewer state; while the vote
 * is open that state carries the viewer's OWN ballot facts only — never
 * running totals. 10s server throttle.
 */
export function castDisputeVote(
  disputeId: number,
  request: CastDisputeVoteRequest,
): Promise<DisputeVoteViewerState> {
  return bccFetchAsClient<DisputeVoteViewerState>(
    `disputes/${disputeId}/vote`,
    {
      method: "POST",
      body: request,
    },
  );
}

/**
 * DELETE /bcc/v1/disputes/:id/vote — withdraw the active ballot. The
 * engine enforces a 24h cooldown before re-entry, and re-entry consumes
 * recast budget. Returns the refreshed viewer state.
 */
export function withdrawDisputeVote(
  disputeId: number,
): Promise<DisputeVoteViewerState> {
  return bccFetchAsClient<DisputeVoteViewerState>(
    `disputes/${disputeId}/vote`,
    {
      method: "DELETE",
    },
  );
}

/**
 * GET /bcc/v1/disputes/:id/vote — the viewer's C10-safe vote state.
 * Open: status + windows + own-ballot facts ONLY (no tallies). Closed:
 * adds outcome + closed_at + the counted tally.
 *
 * OLD-BACKEND TOLERANCE: production may still run the panel-era backend
 * where this route 404s. Callers (useDisputeVote) must treat any error
 * as "no viewer state" and render nothing — never fabricate ballot or
 * tally data client-side.
 */
export function getDisputeVote(
  disputeId: number,
  signal?: AbortSignal,
): Promise<DisputeVoteViewerState> {
  return bccFetchAsClient<DisputeVoteViewerState>(
    `disputes/${disputeId}/vote`,
    {
      method: "GET",
      ...(signal !== undefined ? { signal } : {}),
    },
  );
}
