/**
 * Typed wrappers for §K1 Phase C admin moderation endpoints.
 *
 * Both endpoints are capability-gated server-side (`manage_options`).
 * The frontend route gates separately for fast 403 redirects, but
 * these wrappers don't pre-validate — let the server be the authority.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  ContentReportReason,
  ModerationAction,
  ModerationQueueResponse,
  ModerationStatusFilter,
  ModerationTargetPostKind,
  ResolveReportResponse,
  UndoReportResponse,
} from "@/lib/api/types";

export interface QueueParams {
  status?: ModerationStatusFilter;
  page?: number;
  perPage?: number;
  /** §K1 reason taxonomy filter — server-validated against
   *  ContentReportService::REASON_CODES. */
  reason?: ContentReportReason;
  /** Partial bcc_handle search; server resolves to user_ids
   *  (capped at 50). Empty string is the "no filter" sentinel. */
  reporterHandle?: string;
  /** PeepSo activity post_kind (act_module_id) — narrows the queue
   *  to reports whose target activity is the given kind. */
  postKind?: ModerationTargetPostKind;
  /** ISO 8601 datetime — created_at lower bound. */
  since?: string;
  /** ISO 8601 datetime — created_at upper bound. */
  until?: string;
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
  if (params.reason !== undefined && params.reason !== null) {
    search.set("reason", params.reason);
  }
  if (params.reporterHandle !== undefined && params.reporterHandle !== "") {
    search.set("reporter_handle", params.reporterHandle);
  }
  if (params.postKind !== undefined && params.postKind !== null) {
    search.set("post_kind", params.postKind);
  }
  if (params.since !== undefined && params.since !== "") {
    search.set("since", params.since);
  }
  if (params.until !== undefined && params.until !== "") {
    search.set("until", params.until);
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

/**
 * Reverse the most-recent moderation action within the server's 30s
 * window. The token is the entire authorisation envelope — issued by
 * `resolveAdminReport` and bound server-side to (admin, report,
 * action, expected post-action state).
 *
 * Failure codes the server emits (all surfaced as `BccApiError`):
 *   - `bcc_undo_expired`     — TTL gone or already consumed
 *   - `bcc_undo_forbidden`   — token belongs to a different admin
 *   - `bcc_undo_stale_state` — another moderator acted on the report
 *
 * The caller renders a brief toast in either case. The forward action
 * is NOT rolled back on undo failure; an admin who hits stale-state
 * re-evaluates the queue manually.
 */
export function undoAdminReport(token: string): Promise<UndoReportResponse> {
  return bccFetchAsClient<UndoReportResponse>(
    "admin/reports/undo",
    { method: "POST", body: { token } },
  );
}
