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
import type { NftPiece } from "@/lib/api/types";

/**
 * GET /nft-pieces/{chainSlug}/{contractAddress}/{tokenId}
 *
 * URL-encoding rules per §4.17:
 *   - `tokenId` MUST be URL-encoded — CW-721 ids may contain `/` and
 *     other path-unsafe characters. The server URL-decodes once.
 *   - `chainSlug` and `contractAddress` are passed verbatim — the
 *     canonical forms (lowercased EVM hex, base58 Solana, bech32
 *     Cosmos, ascii chain slug) are URL-safe by construction. Passing
 *     a non-canonical case still resolves correctly (server normalises).
 */
export function getNftPiece(
  chainSlug: string,
  contractAddress: string,
  tokenId: string,
  token: string | null,
  signal?: AbortSignal
): Promise<NftPiece> {
  const path = `nft-pieces/${chainSlug}/${contractAddress}/${encodeURIComponent(tokenId)}`;
  return bccFetch<NftPiece>(path, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
