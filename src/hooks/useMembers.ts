"use client";

/**
 * useMembers — paginated read of /bcc/v1/members.
 *
 * Offset pagination (page + perPage), optional `q` search. Mirrors the
 * useUserReviews / useUserDisputes shape — single-page fetch, the
 * caller pumps the page number through useState. The directory page
 * adds debouncing on `q` so typing doesn't burn API calls per keystroke.
 *
 * `enabled` defaults to true — the directory always wants live data
 * the moment it mounts. Pass `false` to suspend (e.g. while a user
 * is mid-edit on the search input).
 */

import { useQuery } from "@tanstack/react-query";

import { getMembers } from "@/lib/api/members-endpoints";
import type {
  BccApiError,
  MembersResponse,
  MembersTypeFilter,
} from "@/lib/api/types";

const DEFAULT_PER_PAGE = 24;

export const MEMBERS_QUERY_KEY_ROOT = ["members"] as const;

export interface UseMembersOptions {
  page?: number;
  perPage?: number;
  q?: string;
  /** `null` (or omitted) = no type filter. Otherwise restricts to users
   *  who own ≥1 page of the given canonical type. */
  type?: MembersTypeFilter | null;
  enabled?: boolean;
}

export function useMembers(options: UseMembersOptions = {}) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const q = options.q ?? "";
  const type = options.type ?? null;
  const enabled = options.enabled ?? true;

  return useQuery<MembersResponse, BccApiError>({
    queryKey: [...MEMBERS_QUERY_KEY_ROOT, page, perPage, q, type],
    queryFn: ({ signal }) => getMembers({ page, perPage, q, type }, signal),
    enabled,
    staleTime: 30_000,
  });
}
