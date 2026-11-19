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
 *
 * `keepPreviousData` is opt-in, off by default: see the option.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getMembers } from "@/lib/api/members-endpoints";
import type {
  BccApiError,
  MembersResponse,
  MembersTypeFilter,
  MembersVerifiedAxis,
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
  /** Verification axes to AND-filter against. Empty / undefined = no
   *  filter. The hook normalises (sort + dedupe) to keep the React
   *  Query key stable regardless of click order. */
  verified?: MembersVerifiedAxis[];
  /** §21.4 — restrict to actively listed mentors (see MembersQueryParams). */
  mentors?: boolean;
  enabled?: boolean;
  /** Keep the last result on screen while a new key loads (TanStack v5
   *  `placeholderData: keepPreviousData`): the query reports success with
   *  the old rows and `isPlaceholderData` until the new ones land. For the
   *  /members directory, where each debounced keystroke or filter click is
   *  a new key. Off by default: the hook is shared with surfaces (mention
   *  picker, DM recipient search, sidebar) whose own states were written
   *  for a pending query, and a failed fetch still carries no data. */
  keepPreviousData?: boolean;
}

export function useMembers(options: UseMembersOptions = {}) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const q = options.q ?? "";
  const type = options.type ?? null;
  // Sort + dedupe so the queryKey is order-independent — a user toggling
  // "GitHub" then "X" produces the same cache entry as "X" then "GitHub".
  const verified = Array.from(new Set(options.verified ?? [])).sort();
  const verifiedKey = verified.join(",");
  const mentors = options.mentors === true;
  const enabled = options.enabled ?? true;

  return useQuery<MembersResponse, BccApiError>({
    queryKey: [
      ...MEMBERS_QUERY_KEY_ROOT,
      page,
      perPage,
      q,
      type,
      verifiedKey,
      mentors,
    ],
    queryFn: ({ signal }) =>
      getMembers({ page, perPage, q, type, verified, mentors }, signal),
    enabled,
    staleTime: 30_000,
    ...(options.keepPreviousData === true
      ? { placeholderData: keepPreviousData }
      : {}),
  });
}
