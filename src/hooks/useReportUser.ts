"use client";

/**
 * useReportUser — mutation hook over POST /bcc/v1/report-user (§4.27).
 *
 * Mirrors useReportContent. No optimistic UI — member reports are
 * infrequent and the caller drives its own modal close + thank-you /
 * error copy via onSuccess / onError. The "already filed" case arrives
 * as the `already_reported` error code, not a success status.
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import { reportUser } from "@/lib/api/report-user-endpoints";
import type {
  BccApiError,
  CreateUserReportRequest,
  CreateUserReportResponse,
} from "@/lib/api/types";

export function useReportUser(
  options: Omit<
    UseMutationOptions<
      CreateUserReportResponse,
      BccApiError,
      CreateUserReportRequest
    >,
    "mutationFn"
  > = {},
) {
  return useMutation<
    CreateUserReportResponse,
    BccApiError,
    CreateUserReportRequest
  >({
    mutationFn: (request) => reportUser(request),
    ...options,
  });
}
