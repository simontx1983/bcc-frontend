/**
 * Typed wrappers for /me/collection-stances endpoints (§4.31, v1.32).
 *
 * The stance panel is the airdrop-spam answer: instead of inferring
 * demand from passive holdings (forgeable — scammers airdrop into
 * every wallet), users explicitly declare per collection:
 *   - waitlist — "activate this community and count me in"
 *   - spam     — "this is airdropped junk"
 * Both are holder-gated server-side; one stance per collection,
 * switchable. The panel's "live" rows drive the EXISTING
 * joinHolderGroup() — no join logic here.
 *
 * All routes authenticated (`me/...`); 401 → `bcc_unauthorized`.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CollectionStancePanelResponse,
  CollectionStanceResponse,
  SetCollectionStanceRequest,
} from "@/lib/api/types";

/**
 * GET /me/collection-stances/panel — every collection the viewer's
 * wallets hold, with per-row state (live | waitlist), public waitlist
 * count, and the viewer's own stance. Server filters hidden/soft-hidden
 * collections; render as-is (§S).
 */
export function getCollectionStancePanel(
  signal?: AbortSignal
): Promise<CollectionStancePanelResponse> {
  return bccFetchAsClient<CollectionStancePanelResponse>(
    "me/collection-stances/panel",
    { method: "GET", signal }
  );
}

/**
 * POST /me/collection-stances — set or switch the viewer's stance.
 * Failures come back as typed BccApiError:
 *   - bcc_nft_not_owned (403) — linked wallets don't hold the collection
 *   - bcc_unavailable (503)   — holdings couldn't be verified (transient)
 *   - bcc_rate_limited (429)
 */
export function setCollectionStance(
  request: SetCollectionStanceRequest
): Promise<CollectionStanceResponse> {
  return bccFetchAsClient<CollectionStanceResponse>("me/collection-stances", {
    method: "POST",
    body: request,
  });
}

/** DELETE /me/collection-stances — retract the viewer's stance. */
export function clearCollectionStance(
  identity: Pick<SetCollectionStanceRequest, "chain_id" | "contract_address">
): Promise<CollectionStanceResponse> {
  return bccFetchAsClient<CollectionStanceResponse>("me/collection-stances", {
    method: "DELETE",
    body: identity,
  });
}
