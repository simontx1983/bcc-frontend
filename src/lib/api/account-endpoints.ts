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
