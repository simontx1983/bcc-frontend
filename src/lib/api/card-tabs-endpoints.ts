/**
 * Typed wrappers for the §Phase 2 entity-card tab endpoints.
 *
 *   getCardReviews   → GET /entities/{kind}/{id}/reviews   (page-pagination)
 *   getCardDisputes  → GET /entities/{kind}/{id}/disputes  (page-pagination)
 *   getCardWatchers  → GET /entities/{kind}/{id}/watchers  (offset-pagination)
 *
 * Mirrors `user-activity-endpoints.ts` exactly — same `bccFetchAsClient`
 * plumbing, same param-builder pattern. The split file keeps the two
 * surfaces (per-user vs per-card) distinguishable at the import line.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CardDisputesResponse,
  CardReviewsResponse,
  CardWatchersResponse,
  EntityCardKind,
} from "@/lib/api/types";

interface PageParams {
  page?: number;
  perPage?: number;
}

interface OffsetParams {
  offset?: number;
  limit?: number;
}

function buildPageQuery(params: PageParams): string {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    search.set("per_page", String(params.perPage));
  }
  const qs = search.toString();
  return qs !== "" ? `?${qs}` : "";
}

function buildOffsetQuery(params: OffsetParams): string {
  const search = new URLSearchParams();
  if (params.offset !== undefined) {
    search.set("offset", String(params.offset));
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  return qs !== "" ? `?${qs}` : "";
}

/**
 * GET /entities/{kind}/{id}/reviews — paginated list of reviews filed
 * against this entity. Each row carries the full MemberSummary of the
 * review's author. Cache: anon `public, max-age=30`; authed
 * `private, max-age=30`.
 */
export function getCardReviews(
  kind: EntityCardKind,
  id: number,
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<CardReviewsResponse> {
  const path = `entities/${kind}/${id}/reviews${buildPageQuery(params)}`;
  return bccFetchAsClient<CardReviewsResponse>(path, { method: "GET", signal });
}

/**
 * GET /entities/{kind}/{id}/disputes — paginated list of open disputes
 * filed against this entity (V1 surfaces only status=0; resolved +
 * dismissed are intentionally hidden from the entity profile).
 */
export function getCardDisputes(
  kind: EntityCardKind,
  id: number,
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<CardDisputesResponse> {
  const path = `entities/${kind}/${id}/disputes${buildPageQuery(params)}`;
  return bccFetchAsClient<CardDisputesResponse>(path, { method: "GET", signal });
}

/**
 * GET /entities/{kind}/{id}/watchers — paginated list of users
 * watching/pulling this card. Empty for unclaimed cards (no graph
 * anchor); the panel renders a tab-specific "claim to anchor watchers"
 * empty state in that case.
 */
export function getCardWatchers(
  kind: EntityCardKind,
  id: number,
  params: OffsetParams = {},
  signal?: AbortSignal,
): Promise<CardWatchersResponse> {
  const path = `entities/${kind}/${id}/watchers${buildOffsetQuery(params)}`;
  return bccFetchAsClient<CardWatchersResponse>(path, { method: "GET", signal });
}
