/**
 * Typed wrapper for /cards/:type/:id (per §L5).
 *
 * One route, four card kinds. The frontend's <CardFactory> dispatches
 * on `card_kind`; the entity-profile pages (/v, /p, /c, /u) all share
 * this fetcher and just pass the right `type`.
 *
 * Server-safe — uses `bccFetch` directly so server components can
 * call it during SSR with a token sourced from `getServerSession()`.
 *
 * 404 contract: backend returns `bcc_not_found` (status 404) when the
 * type/id combo doesn't resolve. Callers branch on the BccApiError
 * status to delegate to Next's `notFound()`.
 */

import { bccFetch } from "@/lib/api/client";
import type { Card, CardKind } from "@/lib/api/types";

/**
 * GET /cards/:type/:id — full card view-model.
 *
 * `idOrSlug` accepts either a numeric post id or a post_name slug for
 * validator/project/creator, and a bcc_handle for member. The path
 * component is encoded defensively even though the server's
 * route pattern restricts the character set.
 */
export function getCardEntity(
  type: CardKind,
  idOrSlug: string,
  token: string | null,
  signal?: AbortSignal
): Promise<Card> {
  return bccFetch<Card>(`cards/${type}/${encodeURIComponent(idOrSlug)}`, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
