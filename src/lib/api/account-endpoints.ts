/**
 * §V2 Phase 2.5 — typed wrappers for /me/account.
 *
 * Backend: MyAccountEndpoint @ /wp-json/bcc/v1. Standard BCC envelope.
 * Auth required. Every operation re-verifies the user's current password
 * — there is no session-elevation flag.
 *
 * Operations:
 *   - patchAccountEmail        → PATCH  /me/account/email (stages; sends a code)
 *   - verifyAccountEmailChange → POST   /me/account/email/verify (applies)
 *   - patchAccountPassword     → PATCH  /me/account/password
 *   - deleteAccount        → DELETE /me/account
 *
 * Plus the §V2 recovery-email pair (wallet-only accounts attaching a real
 * deliverable email, proven by a wallet signature + OTP):
 *   - requestRecoveryEmail → POST /me/account/recovery-email
 *   - verifyRecoveryEmail  → POST /me/account/recovery-email/verify
 *
 * After a successful deleteAccount() the server tears down the auth
 * cookie, so the client should redirect to `logout_url` (or `/`) rather
 * than try another authenticated call.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  AccountActivityResponse,
  AccountEmailChangePending,
  AccountEmailChangeUnchanged,
  LogoutEverywhereResponse,
  RecoveryEmailRequestBody,
  RecoveryEmailRequestResponse,
  VerifyAccountEmailChangeBody,
  VerifyAccountEmailChangeResponse,
  VerifyRecoveryEmailBody,
  VerifyRecoveryEmailResponse,
} from "@/lib/api/types";

/**
 * F-253 (contract v1.130): how an account change is confirmed. Accounts
 * with a password type it; an account with NO password
 * (`recovery.has_password === false`) signs a purpose-bound challenge with
 * one of its verified, established wallets instead.
 */
export interface PasswordCredential {
  current_password: string;
}
export interface WalletCredential {
  wallet_address: string;
  chain_slug: string;
  signature: string;
  /** Chain-specific (Cosmos: pub_key, chain_id). */
  extra?: Record<string, string>;
}
export type AccountCredential = PasswordCredential | WalletCredential;

export type PatchAccountEmailBody = AccountCredential & {
  email: string;
};

/**
 * Verify-before-apply: this call NEVER changes the email. A new address
 * comes back `pending: true` (a code went to it; confirm with
 * {@link verifyAccountEmailChange}); the account's current address comes
 * back `pending: false`. Discriminate on `pending`.
 */
export type PatchAccountEmailResponse =
  | AccountEmailChangePending
  | AccountEmailChangeUnchanged;

export type PatchAccountPasswordBody = AccountCredential & {
  password: string;
};

/**
 * The server does NOT just acknowledge. `wp_set_password` destroys every
 * WP session token and `JwtToken::revokeAllForUser` bumps the per-user
 * token version, invalidating every outstanding bearer INCLUDING the
 * caller's — so it mints a replacement for the current session and
 * returns it here. docs/api-contract-v1.md:4439: "bearer clients must
 * swap to it."
 *
 * This interface used to stop at `{ ok: true }`, so the replacement was
 * parsed away and discarded. The held token could not even be refreshed
 * (`decodeForRefresh` shares the revoked check), so the next authed call
 * 401'd and the viewer was signed out moments after being told "Saved".
 */
export interface PatchAccountPasswordResponse {
  ok: true;
  /** Replacement bearer for THIS session. A live credential — never log or store it. */
  token: string;
  /** Seconds until the replacement expires (JwtToken::TTL_SECONDS). */
  expires_in: number;
  token_type: "Bearer";
}

export type DeleteAccountBody = AccountCredential & {
  /** Must be the literal string "DELETE" — the server rejects any other value. */
  confirm: "DELETE";
};

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

/**
 * POST /me/account/email/verify — confirm the code and apply the pending
 * address. Every earlier bearer is revoked server-side; the response's
 * `token` is the replacement and must be swapped into the session.
 *
 * Errors (thrown as BccApiError) — see VerifyAccountEmailChangeErrorCode.
 * A wrong code is `bcc_invalid_otp`; `bcc_invalid_request` is "no pending
 * change" (400) or an empty code (422).
 */
export function verifyAccountEmailChange(
  body: VerifyAccountEmailChangeBody,
): Promise<VerifyAccountEmailChangeResponse> {
  return bccFetchAsClient<VerifyAccountEmailChangeResponse>(
    "me/account/email/verify",
    { method: "POST", body },
  );
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
 * POST /me/account/recovery-email — submit a wallet-signed proof + a real
 * email. The caller signs an authed nonce (via runLinkFlow) for a wallet
 * that is already linked + verified; the server emails a 6-digit OTP to
 * the address and returns its masked form + the OTP TTL.
 *
 * Errors (thrown as BccApiError):
 *   bcc_unauthorized      — no session
 *   bcc_invalid_request   — missing fields / unknown chain / wallet not
 *                           linked-or-verified / challenge expired /
 *                           placeholder or malformed email
 *   bcc_signature_invalid — signature did not verify
 *   bcc_conflict          — email already in use by another account
 *   bcc_rate_limited       — too many attempts
 */
export function requestRecoveryEmail(
  body: RecoveryEmailRequestBody,
): Promise<RecoveryEmailRequestResponse> {
  return bccFetchAsClient<RecoveryEmailRequestResponse>(
    "me/account/recovery-email",
    { method: "POST", body },
  );
}

/**
 * POST /me/account/recovery-email/verify — confirm the 6-digit OTP and
 * bind the recovery email to the account.
 *
 * Errors (thrown as BccApiError):
 *   bcc_invalid_request — no pending request (400) / incorrect or expired
 *                         code (422)
 *   bcc_conflict        — email taken in the interim
 *   bcc_rate_limited    — too many attempts
 */
export function verifyRecoveryEmail(
  body: VerifyRecoveryEmailBody,
): Promise<VerifyRecoveryEmailResponse> {
  return bccFetchAsClient<VerifyRecoveryEmailResponse>(
    "me/account/recovery-email/verify",
    { method: "POST", body },
  );
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
