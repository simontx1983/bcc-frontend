/**
 * Typed wrapper for GET /bcc/v1/cards (§G1/§G2 directory list).
 *
 * Sibling to the per-card cards/:type/:id endpoint — same per-item
 * Card shape, just batched + filtered. The endpoint is anonymous-OK
 * (no session required to browse), so we use the public `bccFetch`
 * variant. When a viewer is logged in, NextAuth attaches the Bearer
 * token automatically and the server gates `permissions` per-viewer.
 */

import { bccFetch } from "@/lib/api/client";
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

  const qs = search.toString();
  const path = qs === "" ? "cards" : `cards?${qs}`;

  return bccFetch<CardsListResponse>(path, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
