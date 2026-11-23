"use client";

/**
 * Validator admin V1 read hooks.
 *
 * - `useAdminValidatorDirectory(filters)` — cursor-paged Validator
 *   Directory, keyed by `{chain, state, q}`. Each page carries the
 *   `chains` facet; "Load more" is one `fetchNextPage()`.
 * - `useValidatorRelationshipHistory(filters)` — cursor-paged global
 *   audit history, keyed by `{page_id, user_id}`, newest first.
 * - `useValidatorRelationshipHealth()` — the audit-log hash-chain check.
 *
 * Retry: an admin denial or a route the server does not have yet cannot
 * succeed on a second attempt, so neither is retried — the screen shows
 * its purpose-built panel at once. A rate limit waits and retries (the
 * directory search is a `q` read); anything else keeps the app-wide
 * single retry.
 */

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import {
  getAdminValidatorDirectory,
  getValidatorRelationshipHealth,
  getValidatorRelationshipHistory,
  type AdminValidatorDirectoryParams,
  type ValidatorRelationshipHistoryParams,
} from "@/lib/api/admin-validator-endpoints";
import { isAdminDenial, isAdminToolUnavailable } from "@/lib/api/admin-errors";
import { rateLimitedRetryDelay, retryRateLimitedRead } from "@/lib/api/errors";
import type {
  AdminValidatorDirectoryResponse,
  AdminValidatorPageState,
  BccApiError,
  ValidatorRelationshipHealth,
  ValidatorRelationshipHistoryResponse,
} from "@/lib/api/types";

const PAGE_SIZE = 25;

export const ADMIN_VALIDATORS_QUERY_KEY_ROOT = ["admin", "validators"] as const;

function retryAdminRead(failureCount: number, err: unknown): boolean {
  if (isAdminDenial(err) || isAdminToolUnavailable(err)) return false;
  return retryRateLimitedRead(failureCount, err);
}

/** The next cursor, or undefined when the server says the list is done. */
function nextCursor(page: { pagination: { next_cursor: string | null; has_more: boolean } }) {
  return page.pagination.has_more && page.pagination.next_cursor !== null
    ? page.pagination.next_cursor
    : undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Directory
// ─────────────────────────────────────────────────────────────────────

/** `null` / "" are the "no filter" sentinels; they are not sent. */
export interface AdminValidatorDirectoryFilters {
  chain: string | null;
  state: AdminValidatorPageState | null;
  q: string;
}

export function adminValidatorDirectoryQueryKey(
  filters: AdminValidatorDirectoryFilters,
): QueryKey {
  return [
    ...ADMIN_VALIDATORS_QUERY_KEY_ROOT,
    "directory",
    { chain: filters.chain, state: filters.state, q: filters.q },
  ];
}

export function useAdminValidatorDirectory(filters: AdminValidatorDirectoryFilters) {
  return useInfiniteQuery<
    AdminValidatorDirectoryResponse,
    BccApiError,
    InfiniteData<AdminValidatorDirectoryResponse>,
    QueryKey,
    string | null
  >({
    queryKey: adminValidatorDirectoryQueryKey(filters),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => {
      const params: AdminValidatorDirectoryParams = { limit: PAGE_SIZE };
      if (filters.chain !== null && filters.chain !== "") params.chain = filters.chain;
      if (filters.state !== null) params.state = filters.state;
      if (filters.q !== "") params.q = filters.q;
      if (pageParam !== null) params.cursor = pageParam;
      return getAdminValidatorDirectory(params, signal);
    },
    getNextPageParam: nextCursor,
    // Ownership changes are rare staff actions; PR B's writes invalidate
    // the root, so a short stale window only affects other admins' edits.
    staleTime: 30_000,
    retry: retryAdminRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Global relationship history
// ─────────────────────────────────────────────────────────────────────

/** `null` is the "no filter" sentinel; it is not sent. */
export interface ValidatorRelationshipHistoryFilters {
  pageId: number | null;
  userId: number | null;
}

export function validatorRelationshipHistoryQueryKey(
  filters: ValidatorRelationshipHistoryFilters,
): QueryKey {
  return [
    ...ADMIN_VALIDATORS_QUERY_KEY_ROOT,
    "history",
    { page_id: filters.pageId, user_id: filters.userId },
  ];
}

export function useValidatorRelationshipHistory(filters: ValidatorRelationshipHistoryFilters) {
  return useInfiniteQuery<
    ValidatorRelationshipHistoryResponse,
    BccApiError,
    InfiniteData<ValidatorRelationshipHistoryResponse>,
    QueryKey,
    string | null
  >({
    queryKey: validatorRelationshipHistoryQueryKey(filters),
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => {
      const params: ValidatorRelationshipHistoryParams = { limit: PAGE_SIZE };
      if (filters.pageId !== null) params.pageId = filters.pageId;
      if (filters.userId !== null) params.userId = filters.userId;
      if (pageParam !== null) params.cursor = pageParam;
      return getValidatorRelationshipHistory(params, signal);
    },
    getNextPageParam: nextCursor,
    staleTime: 15_000,
    retry: retryAdminRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Audit-log health
// ─────────────────────────────────────────────────────────────────────

export function useValidatorRelationshipHealth() {
  return useQuery<ValidatorRelationshipHealth, BccApiError>({
    queryKey: [...ADMIN_VALIDATORS_QUERY_KEY_ROOT, "health"],
    queryFn: ({ signal }) => getValidatorRelationshipHealth(signal),
    staleTime: 60_000,
    retry: retryAdminRead,
    retryDelay: rateLimitedRetryDelay,
  });
}
