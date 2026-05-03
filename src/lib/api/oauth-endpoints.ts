/**
 * §V1.5 — typed wrappers for X (Twitter) + GitHub OAuth verification.
 *
 * Backend: bcc-trust plugin's XController + GitHubController, mounted at
 * /wp-json/bcc-trust/v1/{x,github}/*. Auth: bearer JWT (the bcc-trust
 * BearerAuth filter sets current_user before permission_check fires).
 *
 * Envelope wrinkle:
 *   The bcc-trust/v1 namespace returns `{success: true, data: {...}}`,
 *   NOT the bcc/v1 `{data, _meta}` envelope. The standard `bccFetch`
 *   helper rejects responses without `_meta`, so this file uses a
 *   dedicated `bccTrustFetch` that understands the older shape.
 *
 * Return-URL flow (post-V1.5 backend update):
 *   Connect-init endpoints accept a `return_to` query parameter on the
 *   BCC_FRONTEND_ORIGIN allowlist. The backend persists it in user meta
 *   and uses it for the OAuth callback redirect, so the user lands back
 *   on the Next.js page that initiated the flow. We pass NEXTAUTH_URL +
 *   the supplied path; backend rejects anything off-allowlist silently.
 *
 * Disconnect: bearer JWT alone is sufficient (the wp_verify_nonce check
 * was removed when this file landed — it was incompatible with headless
 * callers). No X-WP-Nonce header required.
 */

import { bccTrustFetch } from "@/lib/api/bcc-trust-client";
import type {
  GitHubAuthUrlResponse,
  GitHubDisconnectResponse,
  GitHubRefreshResponse,
  GitHubStatusResponse,
  XAuthUrlResponse,
  XDisconnectResponse,
  XStatusResponse,
  XVerifyShareResponse,
} from "@/lib/api/types";

/**
 * Build a `?return_to=...` query suffix from the supplied path. Defaults
 * to /settings/identity (where the user initiated the flow). The path
 * is composed against `window.location.origin` so it always lands on
 * the active Next.js host — the backend rejects anything outside its
 * BCC_FRONTEND_ORIGIN allowlist.
 */
function returnToQuery(path: string = "/settings/identity"): string {
  const target = `${window.location.origin}${path}`;
  return `?return_to=${encodeURIComponent(target)}`;
}

// ─────────────────────────────────────────────────────────────────────
// X (Twitter)
// ─────────────────────────────────────────────────────────────────────

export function getXStatus(signal?: AbortSignal): Promise<XStatusResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccTrustFetch<XStatusResponse>("/x/status", init);
}

/**
 * Returns the X OAuth authorization URL. Caller is responsible for
 * `window.location.href = response.auth_url`. Backend persists the
 * supplied return_to under the current user, then uses it for the
 * post-callback redirect.
 */
export function getXAuthUrl(returnPath?: string): Promise<XAuthUrlResponse> {
  return bccTrustFetch<XAuthUrlResponse>(`/x/auth${returnToQuery(returnPath)}`, {
    method: "GET",
  });
}

export function disconnectX(): Promise<XDisconnectResponse> {
  return bccTrustFetch<XDisconnectResponse>("/x/disconnect", { method: "POST" });
}

export function verifyXShare(): Promise<XVerifyShareResponse> {
  return bccTrustFetch<XVerifyShareResponse>("/x/verify-share", { method: "POST" });
}

// ─────────────────────────────────────────────────────────────────────
// GitHub
// ─────────────────────────────────────────────────────────────────────

export function getGitHubStatus(signal?: AbortSignal): Promise<GitHubStatusResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccTrustFetch<GitHubStatusResponse>("/github/status", init);
}

export function getGitHubAuthUrl(returnPath?: string): Promise<GitHubAuthUrlResponse> {
  return bccTrustFetch<GitHubAuthUrlResponse>(
    `/github/auth${returnToQuery(returnPath)}`,
    { method: "GET" },
  );
}

export function disconnectGitHub(): Promise<GitHubDisconnectResponse> {
  return bccTrustFetch<GitHubDisconnectResponse>("/github/disconnect", {
    method: "POST",
  });
}

export function refreshGitHub(): Promise<GitHubRefreshResponse> {
  return bccTrustFetch<GitHubRefreshResponse>("/github/refresh", { method: "POST" });
}
