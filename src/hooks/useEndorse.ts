"use client";

/**
 * §V1.5 — endorse / revoke mutation hooks.
 *
 * Both invalidate the matching card view-model so `viewer_has_endorsed`
 * and the `endorsements` stat refresh on the next read. Optimistic UI
 * lives in the EndorseButton component (toggle local state, roll back
 * on error) — keeping it out of the hook lets other surfaces use these
 * without inheriting the optimism.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  endorsePage,
  revokeEndorsement,
  type EndorseRequest,
  type EndorseResponse,
  type RevokeEndorseRequest,
} from "@/lib/api/endorse-endpoints";
import type { BccApiError } from "@/lib/api/types";

const CARD_QUERY_ROOT = ["card"] as const;

export function useEndorsePage(
  options: Omit<
    UseMutationOptions<EndorseResponse, BccApiError, EndorseRequest>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: EndorseResponse, request: EndorseRequest) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<EndorseResponse, BccApiError, EndorseRequest>({
    mutationFn: (request) => endorsePage(request),
    onSuccess: (data, request) => {
      void queryClient.invalidateQueries({ queryKey: CARD_QUERY_ROOT });
      callerOnSuccess?.(data, request);
    },
    ...rest,
  });
}

export function useRevokeEndorsement(
  options: Omit<
    UseMutationOptions<EndorseResponse, BccApiError, RevokeEndorseRequest>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: EndorseResponse, request: RevokeEndorseRequest) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<EndorseResponse, BccApiError, RevokeEndorseRequest>({
    mutationFn: (request) => revokeEndorsement(request),
    onSuccess: (data, request) => {
      void queryClient.invalidateQueries({ queryKey: CARD_QUERY_ROOT });
      callerOnSuccess?.(data, request);
    },
    ...rest,
  });
}
