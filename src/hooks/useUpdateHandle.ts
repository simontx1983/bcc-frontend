"use client";

/**
 * useUpdateHandle — mutation hook over PATCH /me/handle.
 *
 * No optimistic update: the new handle is the user's primary public
 * identity (per §B3) and the server's reply carries the canonical
 * `next_change_at` cooldown stamp. Rendering an unconfirmed handle
 * for even a moment risks confusion if the rename then fails
 * (cooldown active, taken between client check and server check).
 *
 * The 7-day cooldown is enforced server-side (per §B6). Callers can
 * pre-disable the submit button by reading the previous response's
 * `next_change_at` and comparing to `Date.now()`.
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import { updateHandle } from "@/lib/api/onboarding-endpoints";
import type { BccApiError, HandleUpdateResponse } from "@/lib/api/types";

export function useUpdateHandle(
  options: Omit<
    UseMutationOptions<HandleUpdateResponse, BccApiError, string>,
    "mutationFn"
  > = {}
) {
  return useMutation<HandleUpdateResponse, BccApiError, string>({
    mutationFn: (handle) => updateHandle(handle),
    ...options,
  });
}
