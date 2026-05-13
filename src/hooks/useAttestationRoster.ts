"use client";

/**
 * V2 Trust Attestation Layer — Slice D roster read hook.
 *
 * Single-page fetch (no useInfiniteQuery yet — the §J.4 roster is
 * page+per_page envelope; infinite scroll lands when a roster
 * exceeds one page in real usage, which V1 traffic doesn't).
 *
 * Cache:
 *   - keyed by ['attestation-roster', target_kind, target_id, params]
 *   - staleTime 30s — matches the server's §J.4 max-age=30 + the
 *     generation-counter invalidation triggered by Slice C mutations.
 *   - Slice C's useCastAttestation / useRevokeAttestation /
 *     useReaffirmAttestation already invalidate the ['attestation-roster']
 *     root post-mutation, so the FE sees fresh state seconds after
 *     a cast or revoke without polling.
 *
 * Rollout safety: returns `data === undefined` during the initial
 * load. Callers render the empty-state copy verbatim during that
 * window — no spinner, no emotional-tone shift between "loading" /
 * "empty" / "populated." Phillip's note: the roster should progress
 * from empty to populated without layout instability.
 */

import { useQuery } from "@tanstack/react-query";

import {
  getAttestationRoster,
  type AttestationRosterParams,
} from "@/lib/api/attestations-endpoints";
import type {
  AttestationRosterResponse,
  AttestationTargetKind,
  BccApiError,
} from "@/lib/api/types";

const STALE_TIME_MS = 30_000;

export function useAttestationRoster(
  targetKind: AttestationTargetKind | undefined,
  targetId: number | undefined,
  params: AttestationRosterParams = {},
): {
  data: AttestationRosterResponse | undefined;
  isLoading: boolean;
  error: BccApiError | null;
} {
  const enabled =
    targetKind !== undefined && targetId !== undefined && targetId > 0;

  const query = useQuery<AttestationRosterResponse, BccApiError>({
    queryKey: ["attestation-roster", targetKind, targetId, params] as const,
    queryFn: ({ signal }) => {
      if (targetKind === undefined || targetId === undefined || targetId <= 0) {
        // Unreachable under `enabled: false`, but keeps the type narrow.
        return Promise.reject(
          new Error("useAttestationRoster requires targetKind + targetId"),
        );
      }
      return getAttestationRoster(targetKind, targetId, params, signal);
    },
    enabled,
    staleTime: STALE_TIME_MS,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
