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
 * - `useAdminValidatorPage(pageId)` / `useAdminValidatorPageHistory(pageId)`
 *   — one page's relationships and its own history (PR B).
 * - `useAdminUserSearch(query)` — the debounced admin user picker search.
 * - The step-up and the owner link / revoke / cancel writes (PR B).
 *
 * Retry: an admin denial or a route the server does not have yet cannot
 * succeed on a second attempt, so neither is retried — the screen shows
 * its purpose-built panel at once. A rate limit waits and retries (the
 * directory search is a `q` read); anything else keeps the app-wide
 * single retry.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  cancelValidatorOwnerLink,
  getAdminValidatorDirectory,
  getAdminValidatorPageHistory,
  getAdminValidatorPageRelationships,
  getValidatorRelationshipHealth,
  getValidatorRelationshipHistory,
  linkValidatorOwner,
  resendValidatorStepUp,
  revokeValidatorOwner,
  searchAdminUsers,
  startValidatorStepUp,
  type AdminValidatorDirectoryParams,
  type AdminValidatorPageHistoryParams,
  type ValidatorRelationshipHistoryParams,
} from "@/lib/api/admin-validator-endpoints";
import {
  isAdminDenial,
  isAdminIdNotFound,
  isAdminToolUnavailable,
  isOwnershipConflict,
} from "@/lib/api/admin-errors";
import { rateLimitedRetryDelay, retryRateLimitedRead } from "@/lib/api/errors";
import type {
  AdminUserRef,
  AdminValidatorDirectoryResponse,
  AdminValidatorPageRelationships,
  AdminValidatorPageState,
  BccApiError,
  CancelValidatorOwnerLinkRequest,
  CancelValidatorOwnerLinkResponse,
  LinkValidatorOwnerRequest,
  LinkValidatorOwnerResponse,
  RevokeValidatorOwnerRequest,
  RevokeValidatorOwnerResponse,
  ValidatorRelationshipHealth,
  ValidatorRelationshipHistoryResponse,
  ValidatorStepUpResendResponse,
  ValidatorStepUpStartRequest,
  ValidatorStepUpStartResponse,
} from "@/lib/api/types";

const PAGE_SIZE = 25;

export const ADMIN_VALIDATORS_QUERY_KEY_ROOT = ["admin", "validators"] as const;

function retryAdminRead(failureCount: number, err: unknown): boolean {
  if (isAdminDenial(err) || isAdminToolUnavailable(err) || isAdminIdNotFound(err)) return false;
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

// ─────────────────────────────────────────────────────────────────────
// One page (PR B)
// ─────────────────────────────────────────────────────────────────────

/** Prefix of every read about one page: its relationships and its history. */
export function adminValidatorPageQueryKey(pageId: number): QueryKey {
  return [...ADMIN_VALIDATORS_QUERY_KEY_ROOT, "page", pageId];
}

export function useAdminValidatorPage(pageId: number) {
  return useQuery<AdminValidatorPageRelationships, BccApiError>({
    queryKey: [...adminValidatorPageQueryKey(pageId), "relationships"],
    queryFn: ({ signal }) => getAdminValidatorPageRelationships(pageId, signal),
    staleTime: 15_000,
    retry: retryAdminRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

export function useAdminValidatorPageHistory(pageId: number) {
  return useInfiniteQuery<
    ValidatorRelationshipHistoryResponse,
    BccApiError,
    InfiniteData<ValidatorRelationshipHistoryResponse>,
    QueryKey,
    string | null
  >({
    queryKey: [...adminValidatorPageQueryKey(pageId), "history"],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) => {
      const params: AdminValidatorPageHistoryParams = { limit: PAGE_SIZE };
      if (pageParam !== null) params.cursor = pageParam;
      return getAdminValidatorPageHistory(pageId, params, signal);
    },
    getNextPageParam: nextCursor,
    staleTime: 15_000,
    retry: retryAdminRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Admin user search (the owner picker)
// ─────────────────────────────────────────────────────────────────────

const USER_SEARCH_DEBOUNCE_MS = 300;

/**
 * Debounced like useMentionSearch: an empty query sends nothing. The
 * server caps results at 10 and answers an over-throttled search with an
 * empty list, so "no matches" is all the UI can say either way.
 */
export function useAdminUserSearch(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query), USER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);
  const trimmed = debounced.trim();

  return useQuery<AdminUserRef[], BccApiError>({
    queryKey: ["admin", "users", "search", trimmed],
    enabled: trimmed !== "",
    queryFn: async ({ signal }) => (await searchAdminUsers(trimmed, signal)).items,
    staleTime: 10_000,
    retry: retryAdminRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Step-up and the ownership writes (PR B)
// ─────────────────────────────────────────────────────────────────────

/**
 * These mutations' variables carry the admin's password or an emailed
 * code. `gcTime: 0` drops each one from the mutation cache as soon as no
 * component holds it, so neither outlives the step-up dialog.
 */
const SECRET_GC_TIME = 0;

/**
 * An ownership write changes the page, its history, the global history
 * and the directory row. A 409 means the page changed under the admin,
 * so the same reads are refreshed then too.
 */
function refreshOwnershipReads(queryClient: QueryClient, pageId: number): void {
  void queryClient.invalidateQueries({ queryKey: adminValidatorPageQueryKey(pageId) });
  void queryClient.invalidateQueries({ queryKey: [...ADMIN_VALIDATORS_QUERY_KEY_ROOT, "history"] });
  void queryClient.invalidateQueries({ queryKey: [...ADMIN_VALIDATORS_QUERY_KEY_ROOT, "directory"] });
}

export function useStartValidatorStepUp(pageId: number) {
  const queryClient = useQueryClient();
  return useMutation<ValidatorStepUpStartResponse, BccApiError, ValidatorStepUpStartRequest>({
    mutationFn: (body) => startValidatorStepUp(pageId, body),
    gcTime: SECRET_GC_TIME,
    onError: (err) => {
      if (isOwnershipConflict(err)) refreshOwnershipReads(queryClient, pageId);
    },
  });
}

export function useResendValidatorStepUp() {
  return useMutation<ValidatorStepUpResendResponse, BccApiError, string>({
    mutationFn: (stepUpId) => resendValidatorStepUp(stepUpId),
  });
}

/** One ownership write: refresh on success and on a 409. */
function useOwnershipWrite<TData, TVariables>(
  pageId: number,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, BccApiError, TVariables>({
    mutationFn,
    gcTime: SECRET_GC_TIME,
    onSuccess: () => refreshOwnershipReads(queryClient, pageId),
    onError: (err) => {
      if (isOwnershipConflict(err)) refreshOwnershipReads(queryClient, pageId);
    },
  });
}

export function useLinkValidatorOwner(pageId: number) {
  return useOwnershipWrite<LinkValidatorOwnerResponse, LinkValidatorOwnerRequest>(pageId, (body) =>
    linkValidatorOwner(pageId, body),
  );
}

export function useRevokeValidatorOwner(pageId: number) {
  return useOwnershipWrite<
    RevokeValidatorOwnerResponse,
    { linkId: number; body: RevokeValidatorOwnerRequest }
  >(pageId, ({ linkId, body }) => revokeValidatorOwner(pageId, linkId, body));
}

export function useCancelValidatorOwnerLink(pageId: number) {
  return useOwnershipWrite<
    CancelValidatorOwnerLinkResponse,
    { linkId: number; body: CancelValidatorOwnerLinkRequest }
  >(pageId, ({ linkId, body }) => cancelValidatorOwnerLink(pageId, linkId, body));
}
