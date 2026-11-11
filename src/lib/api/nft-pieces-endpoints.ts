/**
 * Typed wrapper for /bcc/v1/nft-pieces/{chainSlug}/{contractAddress}/{tokenId}
 * (V2 Phase 6 / §H1, contract §4.17).
 *
 * Returns an `NftPiece` view-model (§3.7). Anonymous-OK — V2 Phase 6
 * has no viewer-aware fields (`permissions: {}`); response shape is
 * identical for anon and Bearer callers. The token is forwarded when
 * a session exists so future viewer-aware additions don't need a
 * call-site change.
 *
 * Server-safe — uses `bccFetch` directly so server components can
 * call it during SSR with a token sourced from `getServerSession()`.
 *
 * Error contract (BccApiError, branch on `err.status` + `err.code`):
 *   - 422 `bcc_invalid_chain` — unsupported chainSlug.
 *   - 422 `bcc_invalid_request` — malformed contractAddress / empty tokenId.
 *   - 422 `bcc_unsupported_standard` — contract isn't ERC-721/1155/SPL/CW-721.
 *   - 404 `bcc_not_found` — collection unknown OR token doesn't exist.
 *     Caller branches on `err.status === 404` to delegate to Next's
 *     `notFound()`.
 *   - 503 `bcc_upstream_unavailable` — Cosmos read-time fetch failed
 *     and no cache. Retry with backoff (React Query default).
 */

import { bccFetch } from "@/lib/api/client";
import { BccApiError, type NftPiece } from "@/lib/api/types";

const CHAIN_SLUG = /^[a-z0-9-]{1,64}$/;
// EVM 0x-hex, Cosmos bech32 and Solana base58 are all plain alphanumerics.
const CONTRACT_ADDRESS = /^[A-Za-z0-9]{1,128}$/;

/**
 * True when the three parts can be placed in the request path safely.
 *
 * `chain` and `contract` arrive from the page's `?chain=` / `&contract=`
 * query string, so they are attacker-controlled. Interpolated raw, a
 * crafted link could steer the SERVER-side fetch (which carries the
 * viewer's bearer token) to any other `/wp-json` route. Encoding alone
 * is not enough: `encodeURIComponent` leaves `.` alone, so a segment of
 * exactly `..` would still climb a level. Hence: a strict shape for the
 * chain slug and contract, and no `.`/`..` token id.
 */
export function isValidNftPieceRef(chainSlug: string, contractAddress: string, tokenId: string): boolean {
  return (
    CHAIN_SLUG.test(chainSlug) &&
    CONTRACT_ADDRESS.test(contractAddress) &&
    tokenId !== "" &&
    tokenId !== "." &&
    tokenId !== ".."
  );
}

/**
 * GET /nft-pieces/{chainSlug}/{contractAddress}/{tokenId}
 *
 * URL-encoding rules per §4.17:
 *   - `tokenId` MUST be URL-encoded — CW-721 ids may contain `/` and
 *     other path-unsafe characters. The server URL-decodes once.
 *   - `chainSlug` and `contractAddress` are validated against strict
 *     shapes (see isValidNftPieceRef) and also encoded. The canonical
 *     forms (lowercased EVM hex, base58 Solana, bech32 Cosmos, ascii
 *     chain slug) pass unchanged; the server normalises case.
 *
 * An invalid reference is refused with `400 bcc_invalid_request` before
 * any request is made.
 */
export function getNftPiece(
  chainSlug: string,
  contractAddress: string,
  tokenId: string,
  token: string | null,
  signal?: AbortSignal
): Promise<NftPiece> {
  if (!isValidNftPieceRef(chainSlug, contractAddress, tokenId)) {
    return Promise.reject(
      new BccApiError("bcc_invalid_request", "Invalid NFT piece reference.", 400, null),
    );
  }
  const path =
    `nft-pieces/${encodeURIComponent(chainSlug)}/${encodeURIComponent(contractAddress)}/` +
    encodeURIComponent(tokenId);
  return bccFetch<NftPiece>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
