/**
 * Typed wrapper for GET /bcc/v1/members — paginated member directory.
 *
 * Sibling to /bcc/v1/cards (entity directory: validator/project/creator).
 * Returns the slim summary shape from UserViewService::getSummary.
 *
 * Pagination is offset-style (page + per_page), matching reviews/disputes
 * — the directory needs `total_pages` for the count chip the panel
 * renders, which is the directory-style call per §V1.5.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  MembersRankFilter,
  MembersResponse,
  MembersTypeFilter,
  MembersVerifiedAxis,
} from "@/lib/api/types";

export interface MembersQueryParams {
  page?: number;
  perPage?: number;
  /** Search across handle, display_name, user_login. Server caps at 64 chars. */
  q?: string;
  /**
   * Restrict to users who own ≥1 page of the given canonical type.
   * Maps to the §4.4 `type` query param. `null` means "no filter".
   */
  type?: MembersTypeFilter | null;
  /**
   * Restrict to users with the given EXPLICITLY-AWARDED rank
   * (apprentice / journeyman / foreman). Auto-derived Apprentice
   * fallbacks are NOT included — matches the server's
   * UserRankRepository::getUserIdsWithRank docblock.
   */
  rank?: MembersRankFilter | null;
  /**
   * Restrict to users with all listed verifications active. AND
   * semantics — `["x", "github"]` means "X verified AND GitHub
   * verified." Empty array (or undefined) means "no filter".
   */
  verified?: MembersVerifiedAxis[];
}

export function getMembers(
  params: MembersQueryParams = {},
  signal?: AbortSignal,
): Promise<MembersResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    search.set("per_page", String(params.perPage));
  }
  if (params.q !== undefined && params.q !== "") {
    search.set("q", params.q);
  }
  if (params.type !== undefined && params.type !== null) {
    search.set("type", params.type);
  }
  if (params.rank !== undefined && params.rank !== null) {
    search.set("rank", params.rank);
  }
  if (params.verified !== undefined && params.verified.length > 0) {
    // CSV form keeps the URL compact and matches the server-side
    // normaliseVerifiedAxes parser. Sorted to keep query-key cache
    // identity stable regardless of the user's click order.
    search.set("verified", [...params.verified].sort().join(","));
  }
  const qs = search.toString();
  const path = `members${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<MembersResponse>(path, { method: "GET", signal });
}
