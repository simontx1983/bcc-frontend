"use client";

/**
 * §K1 Phase C admin moderation hooks.
 *
 * - `useAdminReports(filter, page)` — paginated queue read.
 * - `useResolveAdminReport(reportId)` — mutation (hide / dismiss /
 *   restore). Invalidates the queue + both feed roots so a fresh
 *   action's effect is visible immediately.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  getAdminReports,
  resolveAdminReport,
} from "@/lib/api/admin-reports-endpoints";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import type {
  BccApiError,
  ModerationAction,
  ModerationQueueResponse,
  ModerationStatusFilter,
  ResolveReportResponse,
} from "@/lib/api/types";

const PER_PAGE = 20;

export const ADMIN_REPORTS_QUERY_KEY_ROOT = ["admin", "reports"] as const;

export function useAdminReports(filter: ModerationStatusFilter, page: number = 1) {
  return useQuery<ModerationQueueResponse, BccApiError>({
    queryKey: [...ADMIN_REPORTS_QUERY_KEY_ROOT, filter, page],
    queryFn: ({ signal }) =>
      getAdminReports({ status: filter, page, perPage: PER_PAGE }, signal),
    staleTime: 15_000,
  });
}

export function useResolveAdminReport(
  reportId: number,
  options: Omit<
    UseMutationOptions<ResolveReportResponse, BccApiError, ModerationAction>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: ResolveReportResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<ResolveReportResponse, BccApiError, ModerationAction>({
    mutationFn: (action) => resolveAdminReport(reportId, action),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_REPORTS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
