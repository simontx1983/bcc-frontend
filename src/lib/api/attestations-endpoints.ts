/**
 * Typed wrappers for /bcc/v1/me/attestations (§4.20 §J — Slice C).
 *
 * Three mutation endpoints. All Bearer-authed (self-only), all
 * `Cache-Control: private, no-store`. Server returns the §1.4
 * envelope; bccFetchAsClient unwraps `data` and surfaces `error` as
 * a typed BccApiError.
 *
 * Error codes the FE branches on (per the §γ error-contract rule —
 * NEVER branch on err.message):
 *   - bcc_unauthorized                       (401)
 *   - bcc_invalid_request                    (400)
 *   - bcc_attestation_self                   (422)
 *   - bcc_attestation_ineligible             (403) — error.data.unlock_hint carries copy
 *   - bcc_attestation_bandwidth_exhausted    (409) — error.data.slot_holders[] (V1 empty)
 *   - bcc_attestation_fraud_blocked          (403)
 *   - bcc_rate_limited                       (429)
 *   - bcc_not_found                          (404)
 *   - bcc_forbidden                          (403)
 *   - bcc_attestation_revoked                (409) — reaffirm-on-revoked
 *   - bcc_internal_error                     (500)
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AttestationCastRequest,
  AttestationCastResponse,
  AttestationKind,
  AttestationReaffirmResponse,
  AttestationRevokeResponse,
  AttestationRosterResponse,
  AttestationTargetKind,
} from "@/lib/api/types";

export interface AttestationRosterParams {
  /** Filter to one kind, or `all` (default) to mix both. */
  kind?: AttestationKind | "all";
  /**
   * Server-side ORDER BY mode. V1 baseline: `reliability` collapses
   * to `decayed_weight` behavior until Slice E ships the
   * Operator Reliability synthesis. The parameter is accepted on
   * the wire either way (contract-stable).
   */
  sort?: "decayed_weight" | "recency" | "reliability";
  /** Include revoked rows after the active set. Default false. */
  include_revoked?: boolean;
  /** 1..20. */
  page?: number;
  /** 1..50, default 24. */
  per_page?: number;
}

/**
 * POST /me/attestations — cast a new attestation.
 *
 * Idempotent on (attestor, target_kind, target_id, kind):
 *   - HTTP 201 + status='created' on real insert
 *   - HTTP 200 + status='existing' on duplicate (same row returned)
 *
 * Failure cases the caller MUST distinguish:
 *   - bcc_attestation_ineligible: tier gate failed; render
 *     error.data.unlock_hint (server-authoritative aspirational copy)
 *   - bcc_attestation_bandwidth_exhausted: kind='stand_behind' only;
 *     error.data.slot_holders carries the rows to revoke from (V1
 *     returns empty array — FE shows the fallback "revoke one to
 *     free a slot" message)
 *   - bcc_attestation_self / bcc_invalid_request: hand-crafted /
 *     stale UI; render error.message verbatim
 */
export function castAttestation(
  request: AttestationCastRequest,
): Promise<AttestationCastResponse> {
  return bccFetchAsClient<AttestationCastResponse>("me/attestations", {
    method: "POST",
    body: request,
  });
}

/**
 * DELETE /me/attestations/:id — revoke (soft-delete).
 *
 * Idempotent: re-DELETE on already-revoked returns 200 with the
 * existing revoked_at (no audit row, no notification).
 *
 * Errors:
 *   - bcc_not_found  (404) — id doesn't exist
 *   - bcc_forbidden  (403) — not your attestation
 */
export function revokeAttestation(
  attestationId: number,
): Promise<AttestationRevokeResponse> {
  return bccFetchAsClient<AttestationRevokeResponse>(
    `me/attestations/${attestationId}`,
    { method: "DELETE" },
  );
}

/**
 * POST /me/attestations/:id/reaffirm — refresh decay baseline.
 *
 * Errors:
 *   - bcc_not_found             (404) — id doesn't exist
 *   - bcc_forbidden             (403) — not your attestation
 *   - bcc_attestation_revoked   (409) — cannot reaffirm a revoked row
 */
export function reaffirmAttestation(
  attestationId: number,
): Promise<AttestationReaffirmResponse> {
  return bccFetchAsClient<AttestationReaffirmResponse>(
    `me/attestations/${attestationId}/reaffirm`,
    { method: "POST" },
  );
}

/**
 * GET /entities/:target_kind/:target_id/attestations — paged + sorted
 * attestation roster for any of the four §J target kinds.
 *
 * Auth-optional. Anonymous viewers receive the same row shape as
 * Bearer viewers — the §J.4 row carries no per-viewer state, so the
 * server returns identical payloads. Caching diverges (anon: shared
 * 30s; authed: private 30s) but that's invisible to the caller.
 *
 * §J.4.1 synthesis invisibility preserved end-to-end: the response
 * carries no `weight_at_time` / `decayed_weight` per-row. Sorting
 * happens server-side; the FE renders the order it receives.
 */
export function getAttestationRoster(
  targetKind: AttestationTargetKind,
  targetId: number,
  params: AttestationRosterParams = {},
  signal?: AbortSignal,
): Promise<AttestationRosterResponse> {
  const search = new URLSearchParams();
  if (params.kind !== undefined) {
    search.set("kind", params.kind);
  }
  if (params.sort !== undefined) {
    search.set("sort", params.sort);
  }
  if (params.include_revoked === true) {
    search.set("include_revoked", "1");
  }
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.per_page !== undefined) {
    search.set("per_page", String(params.per_page));
  }
  const query = search.toString();
  const path = `entities/${targetKind}/${targetId}/attestations${query !== "" ? `?${query}` : ""}`;

  return bccFetchAsClient<AttestationRosterResponse>(
    path,
    signal !== undefined ? { method: "GET", signal } : { method: "GET" },
  );
}
