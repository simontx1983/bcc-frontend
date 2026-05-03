/**
 * Typed wrappers for §K1 Phase C admin moderation endpoints.
 *
 * Both endpoints are capability-gated server-side (`manage_options`).
 * The frontend route gates separately for fast 403 redirects, but
 * these wrappers don't pre-validate — let the server be the authority.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  ModerationAction,
  ModerationQueueResponse,
  ModerationStatusFilter,
  ResolveReportResponse,
} from "@/lib/api/types";

interface QueueParams {
  status?: ModerationStatusFilter;
  page?: number;
  perPage?: number;
}

export function getAdminReports(
  params: QueueParams = {},
  signal?: AbortSignal,
): Promise<ModerationQueueResponse> {
  const search = new URLSearchParams();
  if (params.status !== undefined) {
    search.set("status", params.status);
  }
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.perPage !== undefined) {
    search.set("per_page", String(params.perPage));
  }
  const qs = search.toString();
  const path = `admin/reports${qs !== "" ? `?${qs}` : ""}`;
  return bccFetchAsClient<ModerationQueueResponse>(path, { method: "GET", signal });
}

export function resolveAdminReport(
  reportId: number,
  action: ModerationAction,
): Promise<ResolveReportResponse> {
  return bccFetchAsClient<ResolveReportResponse>(
    `admin/reports/${reportId}/resolve`,
    { method: "POST", body: { action } },
  );
}
