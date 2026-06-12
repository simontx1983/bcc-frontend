/**
 * Typed wrappers for /auth/* endpoints.
 *
 * Login is invoked by NextAuth's `authorize` callback (lib/auth.ts) —
 * not from here. This file covers the OTHER auth endpoints that need
 * direct client invocation:
 *
 *   - loginWithEmail       → POST /auth/login                (email + password → JWT or 2FA challenge)
 *   - verify2fa            → POST /auth/2fa/verify           (challenge token + OTP → JWT)
 *   - resend2faCode        → POST /auth/2fa/resend           (re-send 2FA OTP)
 *   - signup               → POST /auth/signup               (creates account, sends verification email)
 *   - verifyEmail          → POST /auth/verify-email         (OTP code OR one-shot token)
 *   - resendVerification   → POST /auth/resend-verification  (re-send OTP + link)
 *   - token                → POST /auth/token                (re-mint for already-authed user)
 *   - wallet nonce         → GET  /auth/nonce                (§N8 claim challenge)
 *   - wallet link          → POST /auth/wallet-link          (§N8 verify + persist)
 *
 * Email login flow (2FA):
 *   loginWithEmail() → {status:"2fa_required", challenge_token} → /login/two-factor page
 *                    → verify2fa() → AuthTokenResponse → signIn("bcc-verified") → session
 *
 * Email signup flow:
 *   signup() → {ok:true, email} → /verify-email page → verifyEmail() → /login
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type {
  AuthTokenResponse,
  LinkWalletRequest,
  LinkWalletResponse,
  WalletNonceResponse,
  WalletSignupRequest,
} from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────
// 2FA login flow — /auth/login now returns a challenge instead of a JWT.
// The caller checks `status === "2fa_required"` and routes to the 2FA
// page; on success /auth/2fa/verify returns the same AuthTokenResponse
// shape as before, so the signIn("bcc-verified") bridge is unchanged.
// ─────────────────────────────────────────────────────────────────────

export interface TwoFaChallengeResponse {
  status: "2fa_required";
  method: "email";
  challenge_token: string;
}

/**
 * POST /auth/login — email + password credentials.
 *
 * Returns either a 2FA challenge (status "2fa_required") or a full JWT
 * payload (AuthTokenResponse) when 2FA has already been satisfied.
 * Currently always returns the challenge; check `status` to discriminate.
 *
 * Errors (thrown as BccApiError):
 *   bcc_invalid_credentials  — wrong email or password
 *   bcc_email_not_verified   — account hasn't completed signup verification
 *   bcc_invalid_state        — account missing a handle (legacy account)
 *   bcc_rate_limited         — too many attempts from this IP
 */
export async function loginWithEmail(
  email: string,
  password: string,
): Promise<TwoFaChallengeResponse | AuthTokenResponse> {
  return bccFetch<TwoFaChallengeResponse | AuthTokenResponse>("auth/login", {
    method: "POST",
    body: { email, password },
  });
}

/**
 * POST /auth/2fa/verify — consume challenge token + 6-digit OTP → JWT.
 *
 * On wrong code: throws bcc_invalid_2fa_code (challenge token remains
 * valid — the user can retry without restarting login).
 * On expired challenge: throws bcc_invalid_2fa_token.
 */
export async function verify2fa(
  challengeToken: string,
  code: string,
): Promise<AuthTokenResponse> {
  return bccFetch<AuthTokenResponse>("auth/2fa/verify", {
    method: "POST",
    body: { challenge_token: challengeToken, code },
  });
}

/**
 * POST /auth/2fa/resend — send a fresh 2FA OTP for an in-progress challenge.
 *
 * Always resolves (backend returns ok=true regardless of token validity —
 * anti-enumeration). Only throws on network error or rate-limit (3/min).
 */
export async function resend2faCode(challengeToken: string): Promise<void> {
  await bccFetch<{ ok: true }>("auth/2fa/resend", {
    method: "POST",
    body: { challenge_token: challengeToken },
  });
}

// ─────────────────────────────────────────────────────────────────────
// OAuth SSO flow — /auth/oauth (server-side only, called from NextAuth
// signIn/jwt callbacks) + /auth/oauth-complete (client-side, called
// from /signup/complete-profile after handle selection).
// ─────────────────────────────────────────────────────────────────────

export interface OAuthHandleRequiredResponse {
  status: "handle_required";
  provider_token: string;
  email: string;
  display_name: string;
}

export interface OAuthCompleteRequest {
  provider_token: string;
  handle: string;
  display_name?: string;
  /**
   * Required when /auth/oauth returned an empty `email` (Twitter, whose
   * OAuth2 user-context never includes one) — collected on
   * /signup/complete-profile so the account has a real, recoverable
   * address and the welcome email can be sent.
   */
  email?: string;
}

/**
 * POST /auth/oauth-complete — finish OAuth signup by selecting a handle.
 *
 * Called client-side from /signup/complete-profile after the backend
 * returned {status:"handle_required"} during the NextAuth OAuth callback.
 * On success, use `signIn("bcc-verified", ...)` to establish the session.
 *
 * Errors (thrown as BccApiError):
 *   bcc_invalid_oauth_token — provider_token expired (15 min); restart OAuth
 *   bcc_invalid_handle      — handle violates character rules
 *   bcc_handle_reserved     — handle is reserved
 *   bcc_invalid_email       — email missing/invalid (required when the
 *                             OAuth provider didn't supply one)
 *   bcc_conflict            — handle or email already taken
 *   bcc_rate_limited        — too many attempts from this IP
 */
export async function oauthComplete(input: OAuthCompleteRequest): Promise<AuthTokenResponse> {
  return bccFetch<AuthTokenResponse>("auth/oauth-complete", {
    method: "POST",
    body: input,
  });
}

export interface SignupRequest {
  email: string;
  password: string;
  handle: string;
  display_name?: string;
}

/**
 * Returned by POST /auth/signup. No JWT — the user must verify their
 * email via /auth/verify-email before they can sign in.
 */
export interface SignupResponse {
  ok: true;
  /** The email address a verification code was sent to. */
  email: string;
}

/**
 * POST /auth/signup. Creates the WP user and dispatches a verification
 * email, then returns {ok, email}. No JWT is minted — the user must
 * complete email verification before they can log in.
 *
 * On success: redirect the user to /verify-email?email=<email>.
 *
 * Errors (thrown as BccApiError):
 *   bcc_invalid_request    — missing or malformed fields
 *   bcc_invalid_handle     — handle violates character rules
 *   bcc_handle_reserved    — handle is on the reserved list
 *   bcc_conflict           — handle or email already taken
 *   bcc_rate_limited       — too many signups from this IP
 *   bcc_internal_error     — server-side failure
 */
export async function signup(input: SignupRequest): Promise<SignupResponse> {
  return bccFetch<SignupResponse>("auth/signup", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /auth/verify-email — confirm email ownership and complete signup.
 *
 * Two verification paths — pass exactly one:
 *   OTP path:   { email, code }  — 6-digit code from the email (15 min TTL)
 *   Token path: { token }        — one-shot link token from the email (24 h TTL)
 *
 * On success returns a JWT payload (same shape as /auth/login). The frontend
 * should redirect the user to /login after showing a success state, as
 * the returned JWT is not used to establish a NextAuth session directly.
 *
 * Errors (thrown as BccApiError):
 *   bcc_invalid_otp          — wrong or expired OTP code
 *   bcc_invalid_verify_token — link token expired or already used
 *   bcc_already_verified     — account is already verified (409)
 *   bcc_invalid_request      — missing fields
 *   bcc_rate_limited         — 10/hour per IP
 */
export async function verifyEmail(input: {
  email?: string;
  code?: string;
  token?: string;
}): Promise<AuthTokenResponse> {
  return bccFetch<AuthTokenResponse>("auth/verify-email", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /auth/resend-verification — send a fresh OTP + verify link.
 *
 * Always resolves (backend returns ok=true regardless of whether the
 * email matches a real unverified account — anti-enumeration). Only
 * throws on network error or rate-limit (3/hour per IP).
 */
export async function resendVerification(email: string): Promise<void> {
  await bccFetch<{ ok: true }>("auth/resend-verification", {
    method: "POST",
    body: { email },
  });
}

// ─────────────────────────────────────────────────────────────────────
// §N8 wallet challenge / verify pair — drives the claim flow on
// /v/[slug]. signArbitrary happens client-side via Keplr; the server
// owns nonce generation + signature verification.
// ─────────────────────────────────────────────────────────────────────

export interface NonceQueryParams {
  /** Server slug for the chain (e.g. "cosmos", "osmosis"). */
  chain_slug: string;
  /** bech32 address — must match the wallet that will sign. */
  wallet_address: string;
}

/**
 * GET /auth/nonce — server returns a one-shot challenge string the
 * caller must sign with their wallet. 5-minute TTL; re-request on
 * expiry. Anonymous-OK (the verify step is what binds the address
 * to the BCC user).
 */
export function getWalletNonce(
  params: NonceQueryParams
): Promise<WalletNonceResponse> {
  const search = new URLSearchParams({
    chain_slug:     params.chain_slug,
    wallet_address: params.wallet_address,
  });
  return bccFetchAsClient<WalletNonceResponse>(
    `auth/nonce?${search.toString()}`,
    { method: "GET" }
  );
}

/**
 * POST /auth/wallet-link — verify the signature and persist the
 * wallet link. Auth required: the link binds to the current session's
 * BCC user, so 401 anonymously.
 *
 * Errors:
 *   - bcc_unauthorized      — no session
 *   - bcc_invalid_request   — missing/garbled signature payload
 *   - bcc_signature_invalid — server rejected the signature
 *   - bcc_conflict          — wallet already linked to a different user
 */
export function linkWallet(
  request: LinkWalletRequest
): Promise<LinkWalletResponse> {
  return bccFetchAsClient<LinkWalletResponse>("auth/wallet-link", {
    method: "POST",
    body: request,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Wallet-as-credential auth — anonymous siblings of /auth/login +
// /auth/signup. Added to V1 on 2026-04-30 past the plan freeze.
//
// /auth/wallet-nonce is the entry point: anonymous-OK, returns the
// challenge a wallet must sign. The signed result drives either
// /auth/wallet-login (existing user, wallet already linked) or
// /auth/wallet-signup (new user, wallet about to be linked). The
// nonce keyspace is server-side disjoint from the authed nonce so
// challenges issued here cannot be replayed against /auth/wallet-link.
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /auth/wallet-nonce — anonymous wallet-signature challenge.
 * Same response shape as /auth/nonce, no session required.
 *
 * Cache-buster `_t=<ms>` appended to defeat edge / reverse-proxy caches
 * (LiteSpeed, Hostinger, Cloudflare) that key on full URL incl. query
 * string. The OPTIONS preflight for this endpoint has previously been
 * pinned by such caches when an early request landed before the
 * CorsHandler had Cache-Control: no-store wired in; a unique URL per
 * call sidesteps any current OR future stale entry without needing
 * operator-side purges. Server-side this just adds an ignored query
 * param — WP REST routes don't care.
 */
export function getPublicWalletNonce(
  params: NonceQueryParams
): Promise<WalletNonceResponse> {
  const search = new URLSearchParams({
    chain_slug:     params.chain_slug,
    wallet_address: params.wallet_address,
    _t:             Date.now().toString(),
  });
  return bccFetch<WalletNonceResponse>(
    `auth/wallet-nonce?${search.toString()}`,
    { method: "GET" }
  );
}

// NOTE: there is deliberately no walletLogin() wrapper here — wallet
// login flows through the NextAuth wallet Credentials provider
// (lib/auth.ts), which posts to /auth/wallet-login itself so the JWT
// lands inside the NextAuth session. A typed wrapper existed and was
// dead code; deleted 2026-06-12 per the fresh-install policy.

/**
 * POST /auth/wallet-signup — create an account from a wallet
 * signature + chosen handle, link the wallet, return a JWT. Email is
 * optional: when omitted the server mints a deterministic placeholder
 * (`wallet-{md5(addr):16}@noreply.bcc.local`). Password is randomized;
 * recovery to email-login is via the standard "lost your password"
 * flow.
 *
 * Errors:
 *   - bcc_invalid_request       — missing fields / invalid email format
 *   - bcc_invalid_handle        — handle violates §B6 character rules
 *   - bcc_handle_reserved       — handle is on the reserved list
 *   - bcc_conflict              — handle taken (or caller-supplied email taken)
 *   - bcc_signature_invalid     — wallet did not produce a valid signature
 *   - bcc_wallet_already_linked — this wallet is already bound to another account
 *   - bcc_rate_limited          — IP-keyed throttle tripped
 */
export function walletSignup(
  request: WalletSignupRequest
): Promise<AuthTokenResponse> {
  return bccFetch<AuthTokenResponse>("auth/wallet-signup", {
    method: "POST",
    body: request,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Password-reset flow — anonymous, two-step.
//
//   1. /forgot-password page POSTs an email here. Backend ALWAYS
//      responds 200 ok=true regardless of whether the email matches —
//      anti-enumeration. On a real match, backend emails a reset link.
//   2. User clicks the emailed link → /reset-password?key=...&login=...
//      page POSTs to confirmPasswordReset with the new password.
// ─────────────────────────────────────────────────────────────────────

/**
 * POST /auth/forgot-password — request a password-reset email.
 *
 * Returns void; the backend always responds ok=true regardless of
 * whether the email matched a user (anti-enumeration). UI should show
 * a "check your inbox" confirmation either way.
 *
 * Only error a caller can see is `bcc_rate_limited` (3/hour per IP) or
 * a network failure — both warrant surfacing a retryable error.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await bccFetch<{ ok: true }>("auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

/**
 * POST /auth/reset-password — consume a reset key + set a new password.
 *
 * Errors:
 *   - bcc_invalid_reset_token — key is expired, single-use already
 *     consumed, or never existed. UI: "link is expired or invalid".
 *   - bcc_weak_password       — < 8 characters.
 *   - bcc_rate_limited        — 10/hour per IP attempt cap tripped.
 *   - bcc_invalid_request     — missing field.
 */
export async function confirmPasswordReset(
  key: string,
  login: string,
  password: string,
): Promise<void> {
  await bccFetch<{ ok: true }>("auth/reset-password", {
    method: "POST",
    body: { key, login, password },
  });
}
