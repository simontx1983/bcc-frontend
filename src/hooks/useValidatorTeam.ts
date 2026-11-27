"use client";

/**
 * Validator team hooks, member side (validator admin V1, PR B2).
 *
 * Reads:
 *   - `useValidatorTeam(pageId)`: route 5, the team screen's only source.
 *   - `useValidatorTeamPermissions(pageId)`: the owner's permissions grid.
 *   - `useMyTeamInvites()`: the signed-in member's pending invites.
 *
 * Writes refresh what they change: the team read after an invite, remove,
 * re-confirm, leave, visibility change or revert; the permissions read
 * AND the team read after a permissions save (the policy behind `can`
 * moved); my invites (and that page's team) after an accept or decline.
 * A 409 means the team changed under the viewer, so the same reads are
 * refreshed then too.
 *
 * Writes that carry `current_password` (invite, remove, re-confirm,
 * permissions save) are dropped from the mutation cache with `gcTime: 0`,
 * and callers run them through `mutateThenReset`, which resets the
 * mutation the moment it settles, success OR failure. The password never
 * waits in mutation variables for the next try.
 *
 * Retry: a permission boundary, a route the server doesn't have yet and
 * an unknown page can't succeed on a second attempt, so they're not
 * retried; a rate limit waits; anything else keeps the single retry.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationResult,
} from "@tanstack/react-query";

import { isAdminToolUnavailable } from "@/lib/api/admin-errors";
import {
  isCode,
  isPermissionDenial,
  rateLimitedRetryDelay,
  retryRateLimitedRead,
} from "@/lib/api/errors";
import type {
  BccApiError,
  DeclineTeamInviteResponse,
  InviteValidatorTeamMemberRequest,
  LeaveValidatorTeamResponse,
  MyTeamInvitesResponse,
  ReconfirmValidatorTeamMemberRequest,
  RemoveValidatorTeamMemberRequest,
  RemoveValidatorTeamMemberResponse,
  RevertValidatorTeamEventResponse,
  UpdateValidatorTeamPermissionsRequest,
  ValidatorTeamMembershipResponse,
  ValidatorTeamPermissions,
  ValidatorTeamResponse,
  ValidatorTeamVisibility,
} from "@/lib/api/types";
import {
  acceptTeamInvite,
  declineTeamInvite,
  getMyTeamInvites,
  getValidatorTeam,
  getValidatorTeamPermissions,
  inviteValidatorTeamMember,
  leaveValidatorTeam,
  reconfirmValidatorTeamMember,
  removeValidatorTeamMember,
  revertValidatorTeamEvent,
  setValidatorTeamVisibility,
  updateValidatorTeamPermissions,
} from "@/lib/api/validator-team-endpoints";

const TEAM_ROOT = ["me", "validator-team"] as const;

/** Prefix of every read about one page's team: the members and the permissions. */
function teamPageKey(pageId: number): QueryKey {
  return [...TEAM_ROOT, pageId];
}

export function validatorTeamQueryKey(pageId: number): QueryKey {
  return [...teamPageKey(pageId), "members"];
}

export function validatorTeamPermissionsQueryKey(pageId: number): QueryKey {
  return [...teamPageKey(pageId), "permissions"];
}

export const MY_TEAM_INVITES_QUERY_KEY = ["me", "team-invites"] as const;

function retryTeamRead(failureCount: number, err: unknown): boolean {
  if (isPermissionDenial(err) || isAdminToolUnavailable(err) || isCode(err, "bcc_not_found")) {
    return false;
  }
  return retryRateLimitedRead(failureCount, err);
}

// ─────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────

export function useValidatorTeam(pageId: number) {
  return useQuery<ValidatorTeamResponse, BccApiError>({
    queryKey: validatorTeamQueryKey(pageId),
    queryFn: ({ signal }) => getValidatorTeam(pageId, signal),
    // Team changes are rare and every write here refreshes it; a short
    // window only covers another member's edit.
    staleTime: 15_000,
    retry: retryTeamRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

export function useValidatorTeamPermissions(pageId: number) {
  return useQuery<ValidatorTeamPermissions, BccApiError>({
    queryKey: validatorTeamPermissionsQueryKey(pageId),
    queryFn: ({ signal }) => getValidatorTeamPermissions(pageId, signal),
    staleTime: 30_000,
    retry: retryTeamRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

export function useMyTeamInvites() {
  return useQuery<MyTeamInvitesResponse, BccApiError>({
    queryKey: MY_TEAM_INVITES_QUERY_KEY,
    queryFn: ({ signal }) => getMyTeamInvites(signal),
    staleTime: 15_000,
    retry: retryTeamRead,
    retryDelay: rateLimitedRetryDelay,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────

/** Mutations carrying a password leave the cache as soon as nothing holds them. */
const SECRET_GC_TIME = 0;

function refreshTeam(queryClient: QueryClient, pageId: number): void {
  void queryClient.invalidateQueries({ queryKey: validatorTeamQueryKey(pageId) });
}

/**
 * `mutate` for a write that carries a password: the mutation is reset as
 * soon as it settles, success or failure, so the password leaves its
 * variables at once. The callbacks run after the reset.
 */
export function mutateThenReset<TData, TVariables>(
  mutation: UseMutationResult<TData, BccApiError, TVariables>,
  variables: TVariables,
  callbacks: { onSuccess?: (data: TData) => void; onError?: (err: BccApiError) => void },
): void {
  mutation.mutate(variables, {
    onSuccess: (data) => {
      mutation.reset();
      callbacks.onSuccess?.(data);
    },
    onError: (err) => {
      mutation.reset();
      callbacks.onError?.(err);
    },
  });
}

/** One team write: refresh the team on success and on a 409. */
function useTeamWrite<TData, TVariables>(
  pageId: number,
  mutationFn: (variables: TVariables) => Promise<TData>,
  secret: boolean,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, BccApiError, TVariables>({
    mutationFn,
    ...(secret ? { gcTime: SECRET_GC_TIME } : {}),
    onSuccess: () => refreshTeam(queryClient, pageId),
    onError: (err) => {
      if (isCode(err, "bcc_conflict")) refreshTeam(queryClient, pageId);
    },
  });
}

export function useInviteValidatorTeamMember(pageId: number) {
  return useTeamWrite<ValidatorTeamMembershipResponse, InviteValidatorTeamMemberRequest>(
    pageId,
    (body) => inviteValidatorTeamMember(pageId, body),
    true,
  );
}

export function useRemoveValidatorTeamMember(pageId: number) {
  return useTeamWrite<
    RemoveValidatorTeamMemberResponse,
    { membershipId: number; body: RemoveValidatorTeamMemberRequest }
  >(pageId, ({ membershipId, body }) => removeValidatorTeamMember(pageId, membershipId, body), true);
}

export function useReconfirmValidatorTeamMember(pageId: number) {
  return useTeamWrite<
    ValidatorTeamMembershipResponse,
    { membershipId: number; body: ReconfirmValidatorTeamMemberRequest }
  >(
    pageId,
    ({ membershipId, body }) => reconfirmValidatorTeamMember(pageId, membershipId, body),
    true,
  );
}

export function useLeaveValidatorTeam(pageId: number) {
  return useTeamWrite<LeaveValidatorTeamResponse, void>(pageId, () => leaveValidatorTeam(pageId), false);
}

export function useRevertValidatorTeamEvent(pageId: number) {
  return useTeamWrite<RevertValidatorTeamEventResponse, number>(
    pageId,
    (eventId) => revertValidatorTeamEvent(pageId, eventId),
    false,
  );
}

/**
 * The switch shows the server's answer, never the value asked for: the
 * saved `show_publicly` goes into the team read, then it refreshes.
 */
export function useSetValidatorTeamVisibility(pageId: number) {
  const queryClient = useQueryClient();
  return useMutation<ValidatorTeamVisibility, BccApiError, ValidatorTeamVisibility>({
    mutationFn: (body) => setValidatorTeamVisibility(pageId, body),
    onSuccess: (res) => {
      queryClient.setQueryData<ValidatorTeamResponse>(validatorTeamQueryKey(pageId), (prev) =>
        prev === undefined
          ? prev
          : {
              ...prev,
              viewer: { ...prev.viewer, show_publicly: res.show_publicly },
              items: prev.items.map((m) =>
                m.membership_id === prev.viewer.membership_id
                  ? { ...m, show_publicly: res.show_publicly }
                  : m,
              ),
            },
      );
      refreshTeam(queryClient, pageId);
    },
  });
}

/**
 * Saves the whole grid. The answer is the saved settings: it replaces the
 * permissions read, which then refreshes along with the team read (the
 * policy behind route 5's `can` changed).
 */
export function useUpdateValidatorTeamPermissions(pageId: number) {
  const queryClient = useQueryClient();
  return useMutation<ValidatorTeamPermissions, BccApiError, UpdateValidatorTeamPermissionsRequest>({
    mutationFn: (body) => updateValidatorTeamPermissions(pageId, body),
    gcTime: SECRET_GC_TIME,
    onSuccess: (saved) => {
      queryClient.setQueryData(validatorTeamPermissionsQueryKey(pageId), saved);
      void queryClient.invalidateQueries({ queryKey: validatorTeamPermissionsQueryKey(pageId) });
      refreshTeam(queryClient, pageId);
    },
  });
}

function refreshInvites(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: MY_TEAM_INVITES_QUERY_KEY });
}

/** Accept: my invites drop the row, and that page's team now includes the viewer. */
export function useAcceptTeamInvite() {
  const queryClient = useQueryClient();
  return useMutation<
    ValidatorTeamMembershipResponse,
    BccApiError,
    { membershipId: number; pageId: number }
  >({
    mutationFn: ({ membershipId }) => acceptTeamInvite(membershipId),
    onSuccess: (_res, { pageId }) => {
      refreshInvites(queryClient);
      void queryClient.invalidateQueries({ queryKey: teamPageKey(pageId) });
    },
    onError: (err) => {
      if (isCode(err, "bcc_conflict") || isCode(err, "bcc_not_found")) refreshInvites(queryClient);
    },
  });
}

export function useDeclineTeamInvite() {
  const queryClient = useQueryClient();
  return useMutation<DeclineTeamInviteResponse, BccApiError, number>({
    mutationFn: (membershipId) => declineTeamInvite(membershipId),
    onSuccess: () => refreshInvites(queryClient),
    onError: (err) => {
      if (isCode(err, "bcc_conflict") || isCode(err, "bcc_not_found")) refreshInvites(queryClient);
    },
  });
}
