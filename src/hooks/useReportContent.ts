"use client";

/**
 * useReportContent — §K1 Phase B mutation hook over POST /me/reports.
 *
 * No optimistic UI — reports are infrequent + the server's response
 * carries the "created vs existing" signal the toast needs. Caller
 * passes onSuccess / onError to drive their own modal close + toast.
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import { createContentReport } from "@/lib/api/reports-endpoints";
import type {
  BccApiError,
  CreateContentReportRequest,
  CreateContentReportResponse,
} from "@/lib/api/types";

export function useReportContent(
  options: Omit<
    UseMutationOptions<
      CreateContentReportResponse,
      BccApiError,
      CreateContentReportRequest
    >,
    "mutationFn"
  > = {},
) {
  return useMutation<
    CreateContentReportResponse,
    BccApiError,
    CreateContentReportRequest
  >({
    mutationFn: (request) => createContentReport(request),
    ...options,
  });
}
