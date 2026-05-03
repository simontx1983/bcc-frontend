/**
 * Typed wrapper for /pages/:id/claim (§B5 single-claim-wins, §N8
 * guided four-step flow).
 *
 * Server-side: ClaimService matches the viewer's verified wallet
 * against the entity's claim authority (operator address for
 * validators, contract owner for collections). On success, an
 * exclusive claim row is inserted in `bcc_onchain_claims` and the
 * `bcc_page_claimed` event fires for downstream subscribers.
 *
 * Client-only — auth required (wallet must already be linked via
 * /auth/wallet-link before this endpoint will succeed).
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  ClaimPageRequest,
  ClaimPageResponse,
} from "@/lib/api/types";

/**
 * POST /pages/:id/claim — claim a peepso-page for the current user.
 *
 * Errors:
 *   - bcc_unauthorized          — no session
 *   - bcc_precondition_failed   — viewer has no verified wallet
 *   - bcc_forbidden             — wallet doesn't match the operator address
 *   - bcc_conflict              — page already claimed by another user
 *   - bcc_not_found             — page id doesn't exist
 *   - bcc_rate_limited          — too many claim attempts
 */
export function claimPage(request: ClaimPageRequest): Promise<ClaimPageResponse> {
  return bccFetchAsClient<ClaimPageResponse>(`pages/${request.id}/claim`, {
    method: "POST",
    body: {
      id:          request.id,
      entity_type: request.entity_type,
      entity_id:   request.entity_id,
    },
  });
}
