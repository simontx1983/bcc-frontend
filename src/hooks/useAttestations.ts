"use client";

/**
 * V2 Trust Attestation Layer — Slice C mutation hooks.
 *
 * Three React Query mutations wrap the §4.20 §J endpoints. Each
 * invalidates the relevant entity view-model caches on success so
 * the next read re-fetches the updated `viewer_attestation`,
 * `attestation_summary`, and `permissions` blocks.
 *
 * Cache scope: we invalidate broadly (the "card", "member", and
 * "user-profile" query roots) rather than surgically by target id —
 * the cost is one extra refetch on the visible target; the benefit
 * is no stale state on any other surface the user might have just
 * navigated from. This matches the existing endorse-mutation idiom
 * (useEndorse.ts:44).
 *
 * Optimistic UI: NOT in the hook. Per the endorse-hook pattern
 * (useEndorse.ts:9 "Optimistic UI lives in the EndorseButton
 * component"), surface-specific optimism stays in the caller.
 * AttestationActionCluster handles its own optimistic state.
 *
 * Error surfaces: the typed BccApiError carries `code` + `message` +
 * `data`. Per the §γ error-contract rule the FE NEVER branches on
 * `message` — only on `code`. error.data carries:
 *   - bcc_attestation_ineligible: `{ unlock_hint: string }`
 *   - bcc_attestation_bandwidth_exhausted: `{ slot_holders: SlotHolder[], slots_total: number, slots_used: number }`
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  castAttestation,
  reaffirmAttestation,
  revokeAttestation,
} from "@/lib/api/attestations-endpoints";
import type {
  AttestationCastRequest,
  AttestationCastResponse,
  AttestationReaffirmResponse,
  AttestationRevokeResponse,
  BccApiError,
} from "@/lib/api/types";

/**
 * Query roots that may carry stale `viewer_attestation` /
 * `attestation_summary` / `permissions` data post-mutation. Card
 * endorsement uses the same broad-invalidate pattern.
 */
const QUERY_ROOTS_TO_INVALIDATE = [
  ["card"],
  ["cards-list"],
  ["member"],
  ["user-profile"],
  ["attestation-roster"],
] as const;

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>): void {
  for (const root of QUERY_ROOTS_TO_INVALIDATE) {
    void queryClient.invalidateQueries({ queryKey: root });
  }
}

export function useCastAttestation(
  options: Omit<
    UseMutationOptions<
      AttestationCastResponse,
      BccApiError,
      AttestationCastRequest
    >,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (
      data: AttestationCastResponse,
      request: AttestationCastRequest,
    ) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<
    AttestationCastResponse,
    BccApiError,
    AttestationCastRequest
  >({
    mutationFn: (request) => castAttestation(request),
    onSuccess: (data, request) => {
      // Only invalidate when the server actually transitioned state.
      // status='existing' returned the pre-existing row unchanged —
      // no other surface needs to re-fetch.
      if (data.status === "created") {
        invalidateAll(queryClient);
      }
      callerOnSuccess?.(data, request);
    },
    ...rest,
  });
}

export function useRevokeAttestation(
  options: Omit<
    UseMutationOptions<AttestationRevokeResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (
      data: AttestationRevokeResponse,
      attestationId: number,
    ) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<AttestationRevokeResponse, BccApiError, number>({
    mutationFn: (attestationId) => revokeAttestation(attestationId),
    onSuccess: (data, attestationId) => {
      invalidateAll(queryClient);
      callerOnSuccess?.(data, attestationId);
    },
    ...rest,
  });
}

export function useReaffirmAttestation(
  options: Omit<
    UseMutationOptions<AttestationReaffirmResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (
      data: AttestationReaffirmResponse,
      attestationId: number,
    ) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<AttestationReaffirmResponse, BccApiError, number>({
    mutationFn: (attestationId) => reaffirmAttestation(attestationId),
    onSuccess: (data, attestationId) => {
      invalidateAll(queryClient);
      callerOnSuccess?.(data, attestationId);
    },
    ...rest,
  });
}
