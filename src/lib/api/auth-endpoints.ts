/**
 * Typed wrappers for /auth/* endpoints.
 *
 * Login is invoked by NextAuth's `authorize` callback (lib/auth.ts) —
 * not from here. This file covers the OTHER auth endpoints that need
 * direct client invocation:
 *
 *   - signup       → POST /auth/signup       (creates account, returns JWT)
 *   - token        → POST /auth/token        (re-mint for already-authed user)
 *   - wallet nonce → GET  /auth/nonce        (§N8 claim challenge)
 *   - wallet link  → POST /auth/wallet-link  (§N8 verify + persist)
 *
 * Signup runs unauthenticated then hands off to NextAuth's signIn()
 * to establish the session cookie. See app/signup/page.tsx for the
 * full handshake.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type {
  AuthTokenResponse,
  LinkWalletRequest,
  LinkWalletResponse,
  WalletLoginRequest,
  WalletNonceResponse,
  WalletSignupRequest,
} from "@/lib/api/types";

export interface SignupRequest {
  email: string;
  password: string;
  handle: string;
  display_name?: string;
}

/**
 * POST /auth/signup. Returns the JWT + identity payload, OR throws
 * BccApiError on conflict / validation failure (codes:
 * `bcc_invalid_request`, `bcc_invalid_handle`, `bcc_handle_reserved`,
 * `bcc_conflict`, `bcc_rate_limited`, `bcc_internal_error`).
 *
 * Caller should follow up with NextAuth signIn("credentials", ...)
 * using the same email/password to establish the session cookie.
 * The JWT in this response is the source of truth either way — a
 * server-component path that wants to skip NextAuth entirely could
 * stash it directly.
 */
export async function signup(input: SignupRequest): Promise<AuthTokenResponse> {
  return bccFetch<AuthTokenResponse>("auth/signup", {
    method: "POST",
    body: input,
  });
}

// ─────────────────────────────────────────────────────────────────────
// §N8 wallet challenge / verify pair — drives the claim flow on
// /v/[slug]. signArbitrary happens client-side via Keplr; the server
// owns nonce generation + signature verification.
// ─────────────────────────────────────────────────────────────────────

export interface NonceQueryParams {
  /** Server slug for the chain (e.g. "cosmoshub", "osmosis"). */
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
 */
export function getPublicWalletNonce(
  params: NonceQueryParams
): Promise<WalletNonceResponse> {
  const search = new URLSearchParams({
    chain_slug:     params.chain_slug,
    wallet_address: params.wallet_address,
  });
  return bccFetch<WalletNonceResponse>(
    `auth/wallet-nonce?${search.toString()}`,
    { method: "GET" }
  );
}

/**
 * POST /auth/wallet-login — verify a signature and mint a JWT for the
 * BCC user the wallet is linked to. Anonymous; the signature IS the
 * credential.
 *
 * Errors:
 *   - bcc_invalid_request    — missing fields / expired or unknown nonce
 *   - bcc_signature_invalid  — wallet did not produce a valid signature
 *   - bcc_wallet_not_linked  — no account exists for this wallet (frontend should route to /signup)
 *   - bcc_invalid_state      — account exists but has no §B6 handle
 *   - bcc_rate_limited       — IP-keyed throttle tripped
 */
export function walletLogin(
  request: WalletLoginRequest
): Promise<AuthTokenResponse> {
  return bccFetch<AuthTokenResponse>("auth/wallet-login", {
    method: "POST",
    body: request,
  });
}

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
