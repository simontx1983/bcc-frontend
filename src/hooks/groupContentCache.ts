/**
 * Membership changes what a group shows: a member sees `members_only`
 * posts a visitor doesn't, and the roster gains or loses a row. Every
 * join/leave mutation (plain, hall, holder, validator) refreshes that
 * group's feed and roster on success, so neither is left stale.
 *
 * Before this (UX scan 2026-11-12, groups H5), only `router.refresh()`
 * ran: it re-renders the server parts of the page, but the feed and
 * roster are client queries that stayed mounted with the old answer —
 * a new member kept the visitor's teaser feed, and someone who left kept
 * seeing members-only posts until they navigated away.
 */

import { useQueryClient, type QueryClient, type UseMutationOptions } from "@tanstack/react-query";

import { GROUP_FEED_QUERY_KEY_ROOT } from "@/hooks/useGroupFeed";
import { GROUP_MEMBERS_QUERY_KEY_ROOT } from "@/hooks/useGroupMembers";

/** Refetch one group's feed (every channel) and roster. */
export function invalidateGroupContent(queryClient: QueryClient, groupId: number): void {
  void queryClient.invalidateQueries({ queryKey: [...GROUP_FEED_QUERY_KEY_ROOT, groupId] });
  void queryClient.invalidateQueries({ queryKey: [...GROUP_MEMBERS_QUERY_KEY_ROOT, groupId] });
}

/**
 * Options for a join/leave mutation (its variable is the group id) with
 * the group-content refresh composed in front of the caller's own
 * `onSuccess`, which still runs with the same arguments.
 */
export function useGroupContentRefresh<TData, TError, TContext>(
  options: Omit<UseMutationOptions<TData, TError, number, TContext>, "mutationFn">,
): Omit<UseMutationOptions<TData, TError, number, TContext>, "mutationFn"> {
  const queryClient = useQueryClient();
  const callerOnSuccess = options.onSuccess;
  return {
    ...options,
    onSuccess: (...args) => {
      invalidateGroupContent(queryClient, args[1]);
      return callerOnSuccess?.(...args);
    },
  };
}
