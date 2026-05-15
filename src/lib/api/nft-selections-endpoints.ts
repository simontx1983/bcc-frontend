/**
 * Typed client for /bcc/v1/nft-selections — the user's NFT showcase.
 *
 * Backend: NftSelectionController @ Domain/Onchain. Standard BCC
 * envelope (`{data, _meta}`). Auth required — bearer JWT.
 *
 * Surfaces wired in v1 (MVP picker modal + showcase reorder):
 *   - GET  /nft-selections/picker   → live holdings + selected-state
 *   - GET  /nft-selections           → currently-selected list (with chain join)
 *   - POST /nft-selections           → add a selection
 *   - DELETE /nft-selections         → remove a selection
 *   - POST /nft-selections/reorder   → set new display order
 *
 * Deferred — backend exists, no frontend consumer yet:
 *   - POST /nft-selections/refresh  → explicit force re-fetch on-chain
 *     (the picker uses `GET /picker?force=1` instead; this POST is
 *     reserved for non-picker contexts like a future wallets-section
 *     refresh button).
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  NftDeleteSelectionResponse,
  NftPickerResponse,
  NftReorderResponse,
  NftSaveSelectionResponse,
  NftSelectionIdentity,
  NftSelectionsListResponse,
} from "@/lib/api/types";

/**
 * GET /nft-selections/picker. Pass `force=true` to bypass the
 * HoldingsService transient and pull fresh chain data — costs a
 * round-trip per chain. Default reads the cached data.
 */
export function getNftPicker(
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<NftPickerResponse> {
  const params = new URLSearchParams();
  if (options.force === true) params.set("force", "1");
  const qs = params.toString();
  const path = qs !== "" ? `nft-selections/picker?${qs}` : "nft-selections/picker";

  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (options.signal !== undefined) init.signal = options.signal;
  return bccFetchAsClient<NftPickerResponse>(path, init);
}

/**
 * GET /nft-selections. Stable list of the user's saved selections,
 * joined with chains for chain_slug / chain_name / explorer_url so
 * the UI doesn't need a second fetch to render badges and links.
 */
export function listNftSelections(
  signal?: AbortSignal,
): Promise<NftSelectionsListResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<NftSelectionsListResponse>("nft-selections", init);
}

/**
 * POST /nft-selections. Server verifies the token is owned by one of
 * the user's connected wallets before persisting; throws 403
 * `not_owned` if the holdings cache disagrees.
 */
export function saveNftSelection(
  identity: NftSelectionIdentity,
): Promise<NftSaveSelectionResponse> {
  return bccFetchAsClient<NftSaveSelectionResponse>("nft-selections", {
    method: "POST",
    body: identity,
  });
}

/**
 * DELETE /nft-selections. Idempotent — removing a non-existent
 * selection returns `{ok: false}` rather than 404.
 */
export function deleteNftSelection(
  identity: NftSelectionIdentity,
): Promise<NftDeleteSelectionResponse> {
  return bccFetchAsClient<NftDeleteSelectionResponse>("nft-selections", {
    method: "DELETE",
    body: identity,
  });
}

/**
 * POST /nft-selections/reorder. `orderedIds` is the new display order
 * (first element becomes display_order=0, etc.). Selection ids the
 * caller doesn't own are silently skipped server-side — the response
 * `updated` may be smaller than `orderedIds.length` if the local
 * cache lagged behind a remote delete.
 */
export function reorderNftSelections(
  orderedIds: number[],
): Promise<NftReorderResponse> {
  return bccFetchAsClient<NftReorderResponse>("nft-selections/reorder", {
    method: "POST",
    body: { ordered_ids: orderedIds },
  });
}
