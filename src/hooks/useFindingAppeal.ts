"use client";

/**
 * useRequestFindingAppealMutation — the §15.5 once-only appeal request
 * on an own-view misconduct finding (Rank Phase 8).
 *
 * Cache strategy: the progression block (which carries `findings`)
 * rides the member-profile view-model — server-fetched on
 * /me/progression and /u/[handle], and client-cached under
 * `["user", handle]` by useUser. On success we invalidate the whole
 * `["user"]` prefix (cheap — a handful of hover-card entries at most)
 * and the caller drives `router.refresh()` so the server-rendered
 * surfaces re-read the fresh `appeal_status`.
 *
 * Errors are typed BccApiErrors — branch on `err.code`:
 *   - bcc_conflict     — appeal already requested / already decided
 *   - bcc_not_found    — not the caller's finding
 *   - bcc_rate_limited — throttled
 *   - bcc_unauthorized — session expired
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { requestFindingAppeal } from "@/lib/api/ranks-endpoints";
import type { BccApiError, FindingAppealResponse } from "@/lib/api/types";

export function useRequestFindingAppealMutation(
  options: Omit<
    UseMutationOptions<FindingAppealResponse, BccApiError, number>,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<FindingAppealResponse, BccApiError, number>({
    mutationFn: (findingId) => requestFindingAppeal(findingId),
    onSuccess: (data, variables, onMutateResult, context) => {
      void queryClient.invalidateQueries({ queryKey: ["user"] });
      callerOnSuccess?.(data, variables, onMutateResult, context);
    },
    ...rest,
  });
}
