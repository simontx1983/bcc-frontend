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

import { bccFetch } from "@/lib/api/client";
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
  signal?: AbortSignal
): Promise<MemberProfile> {
  return bccFetch<MemberProfile>(`users/${encodeURIComponent(handle)}`, {
    method: "GET",
    token,
    ...(signal !== undefined ? { signal } : {}),
  });
}
