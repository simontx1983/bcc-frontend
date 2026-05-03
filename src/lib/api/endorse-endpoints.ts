/**
 * §V1.5 — typed wrappers for /endorse + /revoke-endorsement.
 *
 * Backend: TrustRestController @ /wp-json/bcc-trust/v1/{endorse,revoke-endorsement}.
 * Both POST. Both bearer-authed via permission_check. Body shape:
 *
 *   POST /endorse           { page_id: int, context?: 'general', reason?: string }
 *   POST /revoke-endorsement { page_id: int, context?: 'general' }
 *
 * The server's response carries the fresh score + endorsement count
 * post-mutation. The hook uses it to update card view-models without
 * a follow-up read.
 */

import { bccTrustFetch } from "@/lib/api/bcc-trust-client";

export interface EndorseRequest {
  page_id: number;
  /** V1 only supports 'general'. Server rejects anything else. */
  context?: "general";
  /** Optional public note. Capped server-side. */
  reason?: string;
}

export interface RevokeEndorseRequest {
  page_id: number;
  context?: "general";
}

/**
 * Fresh post-mutation page state. Server emits the same shape for both
 * endorse + revoke (just `action` flips). Frontend reads
 * `endorsement_count` to drive the count chip — and ignores the
 * `analysis` block (server-only fraud signals per the controller).
 */
export interface EndorseResponse {
  action: "endorse" | "revoke_endorsement";
  page_id: number;
  vote: null;
  endorsement: { endorsement_id: number; page_title: string; context: string; weight: number } | null;
  score: unknown;
  votes_up: number;
  votes_down: number;
  endorsement_count: number;
}

export function endorsePage(request: EndorseRequest): Promise<EndorseResponse> {
  return bccTrustFetch<EndorseResponse>("/endorse", {
    method: "POST",
    body: request,
  });
}

export function revokeEndorsement(
  request: RevokeEndorseRequest,
): Promise<EndorseResponse> {
  return bccTrustFetch<EndorseResponse>("/revoke-endorsement", {
    method: "POST",
    body: request,
  });
}
