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

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type { Card, CardKind } from "@/lib/api/types";

/**
 * The one place the /cards/:type/:id path is spelled. Both the
 * server-side and the client-side fetchers below route through it so
 * the route shape has a single definition.
 *
 * `idOrSlug` accepts either a numeric post id or a post_name slug for
 * validator/project/creator, and a bcc_handle for member. The path
 * component is encoded defensively even though the server's route
 * pattern restricts the character set.
 */
function cardEntityPath(type: CardKind, idOrSlug: string): string {
  return `cards/${type}/${encodeURIComponent(idOrSlug)}`;
}

/**
 * GET /cards/:type/:id — full card view-model. Server-side variant:
 * takes an explicit token from `getServerSession()`.
 */
export function getCardEntity(
  type: CardKind,
  idOrSlug: string,
  token: string | null,
  opts?: { signal?: AbortSignal; revalidate?: number }
): Promise<Card> {
  return bccFetch<Card>(cardEntityPath(type, idOrSlug), {
    method: "GET",
    token,
    ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
    ...(opts?.revalidate !== undefined ? { revalidate: opts.revalidate } : {}),
  });
}

/**
 * GET /cards/:type/:id — browser-side sibling of `getCardEntity`.
 *
 * Same endpoint, same response shape; `bccFetchAsClient` sources the
 * bearer from the NextAuth session (and silently refreshes it) instead
 * of receiving one. Use from React Query hooks — see `useCardEntity`.
 * There is no `revalidate` knob here: Next's fetch cache is a
 * server-only concern, and client-side caching is React Query's job.
 */
export function getCardEntityAsClient(
  type: CardKind,
  idOrSlug: string,
  opts?: { signal?: AbortSignal }
): Promise<Card> {
  return bccFetchAsClient<Card>(cardEntityPath(type, idOrSlug), {
    method: "GET",
    ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
  });
}
