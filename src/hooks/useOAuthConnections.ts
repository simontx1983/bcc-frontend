"use client";

/**
 * §V1.5 — React Query hooks over the X + GitHub OAuth endpoints.
 *
 * Status queries are session-scoped and re-fetched on window focus so
 * a user who completes OAuth in another tab sees the new state on
 * return. Mutations (connect-init, disconnect, verify-share, refresh)
 * invalidate the matching status query on success.
 *
 * The connect-init mutation does NOT redirect on its own — caller does
 * `window.location.href = data.auth_url` so the consuming component
 * can show a "redirecting…" state first if it wants to.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  disconnectGitHub,
  disconnectX,
  getGitHubAuthUrl,
  getGitHubStatus,
  getXAuthUrl,
  getXStatus,
  refreshGitHub,
  verifyXShare,
} from "@/lib/api/oauth-endpoints";
import type {
  BccApiError,
  GitHubAuthUrlResponse,
  GitHubDisconnectResponse,
  GitHubRefreshResponse,
  GitHubStatusResponse,
  XAuthUrlResponse,
  XDisconnectResponse,
  XStatusResponse,
  XVerifyShareResponse,
} from "@/lib/api/types";

export const X_STATUS_QUERY_KEY = ["oauth", "x", "status"] as const;
export const GITHUB_STATUS_QUERY_KEY = ["oauth", "github", "status"] as const;

// ─────────────────────────────────────────────────────────────────────
// X
// ─────────────────────────────────────────────────────────────────────

export function useXStatus(enabled: boolean = true) {
  return useQuery<XStatusResponse, BccApiError>({
    queryKey: X_STATUS_QUERY_KEY,
    queryFn: ({ signal }) => getXStatus(signal),
    staleTime: 30_000,
    enabled,
  });
}

export function useStartXConnect(
  options: Omit<
    UseMutationOptions<XAuthUrlResponse, BccApiError, string | undefined>,
    "mutationFn"
  > = {},
) {
  return useMutation<XAuthUrlResponse, BccApiError, string | undefined>({
    mutationFn: (returnPath) => getXAuthUrl(returnPath),
    ...options,
  });
}

export function useDisconnectX(
  options: Omit<
    UseMutationOptions<XDisconnectResponse, BccApiError, void>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: XDisconnectResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<XDisconnectResponse, BccApiError, void>({
    mutationFn: () => disconnectX(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: X_STATUS_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}

export function useVerifyXShare(
  options: Omit<
    UseMutationOptions<XVerifyShareResponse, BccApiError, void>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: XVerifyShareResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<XVerifyShareResponse, BccApiError, void>({
    mutationFn: () => verifyXShare(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: X_STATUS_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}

// ─────────────────────────────────────────────────────────────────────
// GitHub
// ─────────────────────────────────────────────────────────────────────

export function useGitHubStatus(enabled: boolean = true) {
  return useQuery<GitHubStatusResponse, BccApiError>({
    queryKey: GITHUB_STATUS_QUERY_KEY,
    queryFn: ({ signal }) => getGitHubStatus(signal),
    staleTime: 30_000,
    enabled,
  });
}

export function useStartGitHubConnect(
  options: Omit<
    UseMutationOptions<GitHubAuthUrlResponse, BccApiError, string | undefined>,
    "mutationFn"
  > = {},
) {
  return useMutation<GitHubAuthUrlResponse, BccApiError, string | undefined>({
    mutationFn: (returnPath) => getGitHubAuthUrl(returnPath),
    ...options,
  });
}

export function useDisconnectGitHub(
  options: Omit<
    UseMutationOptions<GitHubDisconnectResponse, BccApiError, void>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: GitHubDisconnectResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<GitHubDisconnectResponse, BccApiError, void>({
    mutationFn: () => disconnectGitHub(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: GITHUB_STATUS_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}

export function useRefreshGitHub(
  options: Omit<
    UseMutationOptions<GitHubRefreshResponse, BccApiError, void>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: GitHubRefreshResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<GitHubRefreshResponse, BccApiError, void>({
    mutationFn: () => refreshGitHub(),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: GITHUB_STATUS_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
