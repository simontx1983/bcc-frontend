/**
 * Typed wrapper for GET /bcc/v1/creators/:slug/gallery (§H1).
 *
 * Anonymous-OK — the gallery is public-facing. The server runs the
 * stale-while-revalidate loop server-side: any expired rows trigger
 * an async refresh, the response carries `is_stale` so the UI can
 * show a soft "Refreshing…" hint without blocking the render.
 *
 * Uses `bccFetchAsClient` so signed-in viewers get their Bearer
 * token forwarded — the only caller (`useCreatorGallery`) runs in
 * a client component. Without this, viewer-aware per-piece
 * permission flags would silently degrade to the anonymous shape.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CreatorGalleryResponse,
  CreatorGallerySort,
} from "@/lib/api/types";

export interface CreatorGalleryParams {
  slug: string;
  page?: number;
  per_page?: number;
  sort?: CreatorGallerySort;
}

export function getCreatorGallery(
  params: CreatorGalleryParams,
  signal?: AbortSignal
): Promise<CreatorGalleryResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.per_page !== undefined) {
    search.set("per_page", String(params.per_page));
  }
  if (params.sort !== undefined) {
    search.set("sort", params.sort);
  }
  const qs = search.toString();
  const path = qs === ""
    ? `creators/${encodeURIComponent(params.slug)}/gallery`
    : `creators/${encodeURIComponent(params.slug)}/gallery?${qs}`;

  return bccFetchAsClient<CreatorGalleryResponse>(path, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}
