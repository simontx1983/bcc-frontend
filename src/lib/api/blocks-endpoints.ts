/**
 * Typed wrappers for §K1 Phase A /me/blocks endpoints.
 *
 * Self-only (auth required). Idempotent — POST on an existing block
 * returns `state: "existing"`; DELETE on a non-existent block returns
 * `removed: false`. Frontend can vary toast copy off these signals.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  BlockUserResponse,
  MyBlocksResponse,
  UnblockUserResponse,
} from "@/lib/api/types";

interface ListBlocksParams {
  page?: number;
  perPage?: number;
}

export function getMyBlocks(
  params: ListBlocksParams = {},
  signal?: AbortSignal,
): Promise<MyBlocksResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    search.set("per_page", String(params.perPage));
  }
  const qs = search.toString();
  const path = `me/blocks${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<MyBlocksResponse>(path, { method: "GET", signal });
}

export function blockUser(userId: number): Promise<BlockUserResponse> {
  return bccFetchAsClient<BlockUserResponse>("me/blocks", {
    method: "POST",
    body: { user_id: userId },
  });
}

export function unblockUser(userId: number): Promise<UnblockUserResponse> {
  return bccFetchAsClient<UnblockUserResponse>(`me/blocks/${userId}`, {
    method: "DELETE",
  });
}
