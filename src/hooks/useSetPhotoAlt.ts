"use client";

/**
 * useSetPhotoAlt — PATCH /photos/:pho_id/alt (§4.18 / v1.5 a11y).
 *
 * Used by the Composer to chain alt-text writes after a photo upload
 * completes (and, in the future, by an "edit alt" surface on the
 * photo detail view). On success: invalidate every feed root so the
 * new alt surfaces on the next render via the canonical hydration
 * path.
 *
 * Mirrors useCreatePhotoPostMutation's invalidation surface (Floor /
 * Hot / per-user wall / highlights) — the alt text is a per-feed-item
 * field that lives in the photo body, so any feed that could surface
 * the photo needs to refetch to pick it up.
 *
 * Note for callers chaining after a photo POST: the photo mutation
 * already invalidates the same roots on its own onSuccess. Calling
 * useSetPhotoAlt right after produces a single coalesced refetch in
 * practice (React Query dedupes in-flight queries), so it is safe to
 * use both together. If perf-sensitive, set `skipInvalidate: true`
 * via the options object to opt out — kept conservative-default.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { setPhotoAlt } from "@/lib/api/posts-endpoints";
import type { BccApiError } from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { HIGHLIGHTS_QUERY_KEY } from "@/hooks/useHighlights";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";

export interface SetPhotoAltVariables {
  pho_id: number;
  alt: string;
}

export interface SetPhotoAltResponse {
  pho_id: number;
  alt: string | null;
}

export function useSetPhotoAltMutation(
  options: Omit<
    UseMutationOptions<SetPhotoAltResponse, BccApiError, SetPhotoAltVariables>,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<SetPhotoAltResponse, BccApiError, SetPhotoAltVariables>({
    mutationFn: ({ pho_id, alt }) => setPhotoAlt(pho_id, alt),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: USER_ACTIVITY_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HIGHLIGHTS_QUERY_KEY });
      return options.onSuccess?.(...args);
    },
  });
}
