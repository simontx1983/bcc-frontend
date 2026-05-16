/**
 * Typed wrapper for GET /bcc/v1/cards (§G1/§G2 directory list).
 *
 * Sibling to the per-card cards/:type/:id endpoint — same per-item
 * Card shape, just batched + filtered. The endpoint is anonymous-OK
 * (no session required to browse), but viewer-aware permissions
 * (`can_pull`, `can_review`, …) only resolve correctly when the
 * server sees the Bearer token. We use `bccFetchAsClient` so that
 * NextAuth's session is read in the browser and forwarded as
 * Authorization: Bearer automatically — signed-in viewers get
 * `allowed: true` on Keep Tabs; anon viewers still get the page
 * back, just with permissions locked.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { CardsListQueryParams, CardsListResponse } from "@/lib/api/types";

export function getCardsList(
  params: CardsListQueryParams,
  signal?: AbortSignal
): Promise<CardsListResponse> {
  const search = new URLSearchParams();

  if (params.kind !== undefined) {
    search.set("kind", params.kind);
  }
  if (params.tier !== undefined) {
    search.set("tier", params.tier);
  }
  if (params.sort !== undefined) {
    search.set("sort", params.sort);
  }
  if (params.q !== undefined && params.q !== "") {
    search.set("q", params.q);
  }
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.per_page !== undefined) {
    search.set("per_page", String(params.per_page));
  }
  if (params.good_standing_only === true) {
    search.set("good_standing_only", "1");
  }
  if (params.chain !== undefined && params.chain !== "") {
    search.set("chain", params.chain);
  }

  const qs = search.toString();
  const path = qs === "" ? "cards" : `cards?${qs}`;

  return bccFetchAsClient<CardsListResponse>(path, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
