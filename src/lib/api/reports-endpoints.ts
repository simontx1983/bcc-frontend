/**
 * Typed wrappers for §K1 Phase B /me/reports endpoints.
 *
 * Self-only (auth required). Server enforces the §K1 reason taxonomy +
 * `comment` requirement when `reason_code === "other"`. Idempotent on
 * retry: the response carries `status: "existing"` when a duplicate is
 * suppressed by the UNIQUE constraint.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CreateContentReportRequest,
  CreateContentReportResponse,
} from "@/lib/api/types";

export function createContentReport(
  request: CreateContentReportRequest,
): Promise<CreateContentReportResponse> {
  return bccFetchAsClient<CreateContentReportResponse>("me/reports", {
    method: "POST",
    body: request,
  });
}
