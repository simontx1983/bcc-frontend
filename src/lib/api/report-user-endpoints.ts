/**
 * Typed wrapper for POST /bcc/v1/report-user (api-contract §4.27).
 *
 * Reports a MEMBER (not a feed_item — that's `me/reports`). Auth +
 * Neutral-standing gated server-side; the report lands in the wp-admin
 * "User Reports" moderation queue where an admin can penalize the
 * reported member's trust score. Sibling of `createContentReport` in
 * reports-endpoints.ts.
 *
 * No idempotent success status: the endpoint returns only `{ message }`.
 * The "already filed" case surfaces as the `already_reported` error
 * code (409), which the caller maps to a friendly terminal state.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CreateUserReportRequest,
  CreateUserReportResponse,
} from "@/lib/api/types";

export function reportUser(
  request: CreateUserReportRequest,
): Promise<CreateUserReportResponse> {
  return bccFetchAsClient<CreateUserReportResponse>("report-user", {
    method: "POST",
    body: request,
  });
}
