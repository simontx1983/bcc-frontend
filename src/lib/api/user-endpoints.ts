/**
 * Typed wrappers for /users/:handle/* endpoints.
 *
 * Both helpers are server-safe (use `bccFetch` directly, not the
 * `bccFetchAsClient` browser variant) — they're called from the
 * /u/[handle] server component during SSR. Pass the BCC bearer token
 * from `getServerSession(authOptions).bccToken` so the response's
 * permissions block (e.g. `bio.is_editable`) reflects the viewer.
 *
 * Anonymous reads are allowed (the server returns a viewer-aware
 * response with public-only fields when no token is sent), so a null
 * token is valid — pass `null` rather than failing.
 *
 * 404 contract: when the handle is unknown the server returns the
 * canonical `bcc_not_found` error envelope and bccFetch throws a
 * BccApiError with `status === 404`. Callers branch on that to
 * delegate to Next's `notFound()`.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type { MemberProfile } from "@/lib/api/types";

/**
 * GET /users/:handle — full member-profile view-model.
 *
 * The server caches per-viewer for 30s (no-store when viewer == self).
 * SSR re-fetches on every navigation, so React Query is not in this
 * path; client-side refresh hooks can be added later if a logged-in
 * viewer wants live updates from a tab they're already viewing.
 */
export function getUser(
  handle: string,
  token: string | null,
  opts?: { signal?: AbortSignal; revalidate?: number }
): Promise<MemberProfile> {
  return bccFetch<MemberProfile>(`users/${encodeURIComponent(handle)}`, {
    method: "GET",
    token,
    ...(opts?.signal !== undefined ? { signal: opts.signal } : {}),
    ...(opts?.revalidate !== undefined ? { revalidate: opts.revalidate } : {}),
  });
}

/**
 * Client twin of `getUser` — reads the session bearer itself. Backs the
 * lazy `useUser` hook that enriches the author hover/sidebar card (bio +
 * counts) on demand, Twitter-style. Cached per handle by React Query so
 * repeated hovers over the same author don't refetch.
 */
export function getUserAsClient(
  handle: string,
  signal?: AbortSignal
): Promise<MemberProfile> {
  return bccFetchAsClient<MemberProfile>(`users/${encodeURIComponent(handle)}`, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
