/**
 * §V2 Phase 2.5 — typed wrappers for /me/account.
 *
 * Backend: MyAccountEndpoint @ /wp-json/bcc/v1. Standard BCC envelope.
 * Auth required. Every operation re-verifies the user's current password
 * — there is no session-elevation flag.
 *
 * Three operations:
 *   - patchAccountEmail    → PATCH  /me/account/email
 *   - patchAccountPassword → PATCH  /me/account/password
 *   - deleteAccount        → DELETE /me/account
 *
 * After a successful deleteAccount() the server tears down the auth
 * cookie, so the client should redirect to `logout_url` (or `/`) rather
 * than try another authenticated call.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AccountActivityResponse,
  LogoutEverywhereResponse,
} from "@/lib/api/types";

export interface PatchAccountEmailBody {
  current_password: string;
  email: string;
}

export interface PatchAccountEmailResponse {
  email: string;
}

export interface PatchAccountPasswordBody {
  current_password: string;
  password: string;
}

export interface PatchAccountPasswordResponse {
  ok: true;
}

export interface DeleteAccountBody {
  current_password: string;
  /** Must be the literal string "DELETE" — the server rejects any other value. */
  confirm: "DELETE";
}

export interface DeleteAccountResponse {
  deleted: true;
  logout_url: string;
}

export function patchAccountEmail(
  body: PatchAccountEmailBody,
): Promise<PatchAccountEmailResponse> {
  return bccFetchAsClient<PatchAccountEmailResponse>("me/account/email", {
    method: "PATCH",
    body,
  });
}

export function patchAccountPassword(
  body: PatchAccountPasswordBody,
): Promise<PatchAccountPasswordResponse> {
  return bccFetchAsClient<PatchAccountPasswordResponse>("me/account/password", {
    method: "PATCH",
    body,
  });
}

export function deleteAccount(
  body: DeleteAccountBody,
): Promise<DeleteAccountResponse> {
  return bccFetchAsClient<DeleteAccountResponse>("me/account", {
    method: "DELETE",
    body,
  });
}

/**
 * GET /me/account-activity — Tier D in-app audit timeline.
 *
 * Self-only paginated read of the six user-facing security events
 * that correspond 1:1 to AccountSecurityMailer emails (§4.23).
 * Server-side action allowlist enforced; non-security audit rows
 * never leak. IP masked at the boundary.
 */
export function getMyAccountActivity(
  page: number = 1,
  perPage: number = 20,
): Promise<AccountActivityResponse> {
  const search = new URLSearchParams();
  search.set("page", String(page));
  search.set("per_page", String(perPage));
  return bccFetchAsClient<AccountActivityResponse>(
    `me/account-activity?${search.toString()}`,
    { method: "GET" },
  );
}

/**
 * POST /auth/logout-everywhere — Tier D destructive credential
 * mutation. Bumps the user's token-version counter so every
 * outstanding JWT (including this request's bearer) fails the version
 * check on next use. Caller MUST call NextAuth `signOut()` immediately
 * on success — the local session is out of sync with the server.
 *
 * The handler writes a `sessions_revoked_all` audit row and fires the
 * AccountSecurityMailer confirmation email before bumping the
 * version, so the action is visible in the user's timeline on the
 * subsequent sign-in.
 */
export function logoutEverywhere(): Promise<LogoutEverywhereResponse> {
  return bccFetchAsClient<LogoutEverywhereResponse>("auth/logout-everywhere", {
    method: "POST",
  });
}
