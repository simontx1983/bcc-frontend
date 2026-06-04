"use client";

/**
 * React Query mutations for the claimer-owned page-image routes.
 *
 *   - useUploadPageAvatar — POST multipart avatar for a page id
 *   - useDeletePageAvatar — DELETE the page avatar (revert to auto logo)
 *
 * Both gate on the server's `can_edit_image` permission (the calling
 * component only mounts the affordance when `.allowed`). On success they
 * invalidate the shared `["card"]` query root — same convention as
 * useEndorse / useAttestations — so any client-mounted card panel
 * refetches, and call `router.refresh()` so the server-rendered hero
 * (which fetches the card view-model during SSR, not via React Query)
 * rehydrates with the recomputed crest. The upload is stored as the
 * page's WP featured image, which the crest resolver ranks above the
 * auto-imported logo, so after the refetch `card.crest.image_url`
 * reflects the new image (or reverts on delete).
 *
 * The caller's own onSuccess/onError pass through after the cache
 * invalidation so components can surface confirmations / errors.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  uploadPageAvatar,
  deletePageAvatar,
  type PageAvatarResult,
} from "@/lib/api/page-avatar-endpoints";
import type { BccApiError } from "@/lib/api/types";

const CARD_QUERY_ROOT = ["card"] as const;

export function useUploadPageAvatar(
  pageId: number,
  options: Omit<
    UseMutationOptions<PageAvatarResult, BccApiError | Error, File>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: PageAvatarResult, file: File) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<PageAvatarResult, BccApiError | Error, File>({
    mutationFn: (file) => uploadPageAvatar(pageId, file),
    onSuccess: (data, file) => {
      void queryClient.invalidateQueries({ queryKey: CARD_QUERY_ROOT });
      router.refresh();
      callerOnSuccess?.(data, file);
    },
    ...rest,
  });
}

export function useDeletePageAvatar(
  pageId: number,
  options: Omit<
    UseMutationOptions<PageAvatarResult, BccApiError | Error, void>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: PageAvatarResult) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<PageAvatarResult, BccApiError | Error, void>({
    mutationFn: () => deletePageAvatar(pageId),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: CARD_QUERY_ROOT });
      router.refresh();
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
