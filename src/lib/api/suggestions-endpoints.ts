/**
 * Typed wrapper for GET /suggestions/users.
 *
 * Goes through `bccFetchAsClient` — the Suggested sidebar widget is a
 * client-rendered widget on the same bcc/v1 API as the feed and the
 * trending block (mirrors hashtags-endpoints.ts). AUTH REQUIRED: the
 * recommender is personalized to the viewer; anonymous callers get a
 * 401 from the server, and the widget never fires the query for them.
 *
 * Server returns rows in recommendation order; the frontend renders
 * them as-is (no client-side ranking). `suggestion_reason.label` is
 * pre-rendered presentation copy — the FE shows it verbatim.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { SuggestedMembersResponse } from "@/lib/api/types";

export function getSuggestedMembers(
  limit = 5,
  signal?: AbortSignal
): Promise<SuggestedMembersResponse> {
  const path = `suggestions/users?limit=${limit}`;
  return bccFetchAsClient<SuggestedMembersResponse>(path, { method: "GET", signal });
}
