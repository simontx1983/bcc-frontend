"use client";

/**
 * §K1 Phase C admin moderation hooks.
 *
 * - `useAdminReports(filter, page)` — paginated queue read.
 * - `useResolveAdminReport(reportId)` — mutation (hide / dismiss /
 *   restore). Invalidates the queue + both feed roots so a fresh
 *   action's effect is visible immediately.
 * - `useUndoAdminReport()` — single-action mutation that consumes a
 *   server-issued undo token within the 30s recovery window. NOT a
 *   generalised rollback (see pattern-registry.md "Moderation
 *   recovery affordances").
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  getAdminReports,
  type QueueParams,
} from "@/lib/api/admin-reports-endpoints";
import {
  resolveAdminReport,
  undoAdminReport,
} from "@/lib/api/admin-reports-endpoints";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import type {
  BccApiError,
  ContentReportReason,
  ModerationAction,
  ModerationQueueResponse,
  ModerationStatusFilter,
  ModerationTargetPostKind,
  ResolveReportResponse,
  UndoReportResponse,
} from "@/lib/api/types";

const PER_PAGE = 20;

export const ADMIN_REPORTS_QUERY_KEY_ROOT = ["admin", "reports"] as const;

/**
 * Caller-controlled filter inputs. The hook builds the QueueParams
 * sent to the server from these — empty / null fields are dropped
 * before serialization. `null` is the "no filter" sentinel for chip
 * selections; empty string is the same for free-text + date inputs.
 */
export interface AdminReportsFilters {
  status: ModerationStatusFilter;
  reason: ContentReportReason | null;
  reporterHandle: string;
  postKind: ModerationTargetPostKind | null;
  since: string;
  until: string;
}

export const DEFAULT_ADMIN_REPORTS_FILTERS: AdminReportsFilters = {
  status:         "pending",
  reason:         null,
  reporterHandle: "",
  postKind:       null,
  since:          "",
  until:          "",
};

export function useAdminReports(filters: AdminReportsFilters, page: number = 1) {
  // Build the query-string params: drop empty/null fields so the
  // server's defaults apply and the cache key stays narrow.
  const params: QueueParams = { status: filters.status, page, perPage: PER_PAGE };
  if (filters.reason !== null) params.reason = filters.reason;
  if (filters.reporterHandle !== "") params.reporterHandle = filters.reporterHandle;
  if (filters.postKind !== null) params.postKind = filters.postKind;
  if (filters.since !== "") params.since = filters.since;
  if (filters.until !== "") params.until = filters.until;

  return useQuery<ModerationQueueResponse, BccApiError>({
    queryKey: [
      ...ADMIN_REPORTS_QUERY_KEY_ROOT,
      filters.status,
      filters.reason ?? "_any",
      filters.reporterHandle,
      filters.postKind ?? "_any",
      filters.since,
      filters.until,
      page,
    ],
    queryFn: ({ signal }) => getAdminReports(params, signal),
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

/**
 * Mutation hook for the §K1 moderation undo affordance.
 *
 * The token is the entire authorisation envelope — issued by the
 * server on the prior `resolveAdminReport` success and bound to
 * (admin, report, action, expected post-action state). The hook
 * passes it through and invalidates the same query roots as the
 * forward mutation so the report reappears in the pending tab and
 * any feed surface that excluded a now-restored activity re-includes
 * it on next refetch.
 *
 * Errors the caller renders as a brief toast (per
 * `BccApiError.code`):
 *   - `bcc_undo_expired`     — window passed or token already used
 *   - `bcc_undo_forbidden`   — token belongs to a different admin
 *   - `bcc_undo_stale_state` — another moderator acted on the report
 *
 * The forward action is NOT rolled back on undo failure. Failure
 * means the moderator needs to look at the queue again, not that the
 * system needs to retry.
 */
export function useUndoAdminReport(
  options: Omit<
    UseMutationOptions<UndoReportResponse, BccApiError, string>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: UndoReportResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<UndoReportResponse, BccApiError, string>({
    mutationFn: (token) => undoAdminReport(token),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_REPORTS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
