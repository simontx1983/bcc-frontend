/**
 * Typed wrapper for /users/mention-search — backs the composer's
 * @-mention autocomplete dropdown (api-contract-v1.md §3.3.12 + §4.4).
 *
 * Auth-required: the server returns 401 to anonymous viewers. The
 * picker is composer-only and the composer is auth-gated, so the
 * client never invokes this anonymously in practice.
 *
 * Server-side privacy: the endpoint routes through PeepSoUserSearch
 * (NOT bcc-search's dormant raw-LIKE repository) so banned/blocked/
 * hidden/private users never surface in the dropdown. Picker results
 * are advisory — the server re-validates each token at /posts*
 * write-time via the §3.3.12 MentionPolicy strict-reject rule.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { MentionSearchResponse } from "@/lib/api/types";

/** GET /bcc/v1/users/mention-search?q=&limit=. Auth-required. */
export function searchMentions(
  query: string,
  limit?: number
): Promise<MentionSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (typeof limit === "number" && limit > 0) {
    params.set("limit", String(limit));
  }
  return bccFetchAsClient<MentionSearchResponse>(
    `users/mention-search?${params.toString()}`,
    { method: "GET" }
  );
}
