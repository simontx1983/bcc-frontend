"use client";

/**
 * useCompleteOnboarding — mutation hook over POST /me/onboarding/complete.
 *
 * Fires the server's `bcc_onboarding_completed` event (idempotent;
 * subsequent calls are no-ops). The caller passes `onSuccess` /
 * `onError` to react to the result — the hook itself stays UI-agnostic
 * so it can be reused outside the wizard (e.g. from a "skip" button
 * inside a settings page).
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { completeOnboarding } from "@/lib/api/onboarding-endpoints";
import type {
  BccApiError,
  OnboardingCompleteRequest,
  OnboardingCompleteResponse,
} from "@/lib/api/types";

export function useCompleteOnboarding(
  options: Omit<
    UseMutationOptions<OnboardingCompleteResponse, BccApiError, OnboardingCompleteRequest>,
    "mutationFn"
  > = {}
) {
  return useMutation<OnboardingCompleteResponse, BccApiError, OnboardingCompleteRequest>({
    mutationFn: (body) => completeOnboarding(body),
    ...options,
  });
}
