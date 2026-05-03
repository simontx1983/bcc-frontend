/**
 * BCC API client — the single fetch wrapper every endpoint hook calls.
 *
 * Responsibilities (intentionally narrow):
 *   1. Resolve URL relative to NEXT_PUBLIC_BCC_API_URL.
 *   2. Set Authorization: Bearer when a token is provided.
 *   3. Set Content-Type: application/json for JSON bodies.
 *   4. Parse the §L5 envelope: unwrap `data` on success, throw
 *      `BccApiError` (with code + status + body) on `error` envelope
 *      OR on a non-2xx response missing the envelope.
 *   5. Pass through abort signals for React Query cancellation.
 *
 * Non-responsibilities:
 *   - Token storage / refresh (NextAuth owns the session JWT).
 *   - Retry logic (React Query owns retries via defaultOptions).
 *   - Caching (React Query owns the query cache).
 *
 * Error contract: every non-2xx returns a BccApiError. UI components
 * branch on `err.code` (stable) not `err.message` (humanizable text
 * may be localized later).
 */

import { clientEnv } from "@/lib/env";
import type { ApiErrorBody, ApiSuccess } from "./types";
import { BccApiError } from "./types";

export interface RequestOptions {
  /** HTTP method. Defaults to GET. */
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | undefined;
  /** JSON-serializable body. Stringified before send; sets Content-Type. */
  body?: unknown;
  /** Bearer token from the active session. Omit for unauth endpoints. */
  token?: string | null | undefined;
  /** Forwarded to fetch — React Query passes one for cancellation. */
  signal?: AbortSignal | undefined;
  /** Additional headers; merged on top of defaults. */
  headers?: Record<string, string> | undefined;
}

/**
 * Send a request to /wp-json/bcc/v1/{path}, parse the envelope,
 * return `data` on success, throw BccApiError on failure.
 */
export async function bccFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token, signal, headers: extraHeaders } = options;

  const url = buildUrl(path);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extraHeaders,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token !== undefined && token !== null && token !== "") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // `same-origin` would block cross-origin cookies; `include` lets the
  // WP auth cookie flow when same-origin AND respects CORS allowlist.
  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  if (signal !== undefined) {
    init.signal = signal;
  }

  const response = await fetch(url, init);

  // 204 No Content — no body to parse. Return undefined cast as T;
  // callers using bccFetch<void> see this cleanly.
  if (response.status === 204) {
    return undefined as T;
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new BccApiError(
      "bcc_invalid_response",
      `Non-JSON response from ${path} (${response.status})`,
      response.status,
      null
    );
  }

  // Error envelope: {error: {code, message, status}, _meta: ...}
  if (isErrorEnvelope(parsed)) {
    throw new BccApiError(
      parsed.error.code,
      parsed.error.message,
      parsed.error.status,
      parsed
    );
  }

  // Non-2xx without proper envelope — unexpected; surface generically.
  if (!response.ok) {
    throw new BccApiError(
      "bcc_unexpected_status",
      `Unexpected ${response.status} response from ${path}`,
      response.status,
      null
    );
  }

  if (!isSuccessEnvelope<T>(parsed)) {
    throw new BccApiError(
      "bcc_invalid_envelope",
      `Response from ${path} did not match the BCC envelope shape`,
      response.status,
      null
    );
  }

  return parsed.data;
}

function buildUrl(path: string): string {
  // Accept either "/auth/login" (preferred) or full "/wp-json/bcc/v1/auth/login".
  // Strip a leading slash so the join is unambiguous.
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  if (trimmed.startsWith("wp-json/")) {
    return `${clientEnv.BCC_API_URL}/${trimmed}`;
  }
  return `${clientEnv.BCC_API_URL}/wp-json/bcc/v1/${trimmed}`;
}

function isErrorEnvelope(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["error"] !== "object" || v["error"] === null) return false;
  const e = v["error"] as Record<string, unknown>;
  return (
    typeof e["code"] === "string" &&
    typeof e["message"] === "string" &&
    typeof e["status"] === "number"
  );
}

function isSuccessEnvelope<T>(value: unknown): value is ApiSuccess<T> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return "data" in v && typeof v["_meta"] === "object";
}

// =====================================================================
// Client-only session-aware wrapper
// =====================================================================
// The base `bccFetch` above is server-safe (no React deps) — server
// components and route handlers call it directly with a token sourced
// from `getServerSession(authOptions)`. Browser code uses this thin
// wrapper instead so it doesn't have to thread the token through
// every component.
//
// IMPORTANT: this import pulls in `next-auth/react` which is
// client-only. Calling `bccFetchAsClient` from a server component or
// route handler is a programming error — guarded below with a
// `typeof window` check that fails loud rather than silently shipping
// the wrong fetch path. Server-side callers use `bccFetch` with a
// token sourced from `getServerSession(authOptions)`.
//
// TODO (deferred): when SSR pages start needing the BCC token, add a
// `bccFetchWithSession(session, path, options)` server-side helper
// that takes a server-fetched session and threads through Bearer.
// Tracked at: <plan reference, when V1.5 SSR work begins>
// =====================================================================

import { getSession, signOut } from "next-auth/react";

/**
 * Session-aware fetch for client components. Reads the BCC token
 * out of the active NextAuth session and forwards it as Bearer.
 *
 * If no session is active, the request still goes out — useful for
 * routes that work for anon users (e.g. /feed/hot). Anon endpoints
 * that DO require auth return 401 with a typed BccApiError.
 *
 * Token-expiry handling: when a request that DID carry a Bearer token
 * comes back 401, the server has rejected the JWT (expired, revoked,
 * bad signature — the bcc-trust BearerAuth middleware translates all
 * of these to `bcc_unauthorized` to avoid leaking which check failed).
 * We clear the now-dead NextAuth session via `signOut({redirect:false})`
 * so subsequent calls don't keep retrying with the bad token. The
 * caller still sees the BccApiError thrown, so route-level error
 * boundaries can redirect to /login as needed.
 */
export async function bccFetchAsClient<T>(
  path: string,
  options: Omit<RequestOptions, "token"> = {}
): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error(
      "[bcc-frontend] bccFetchAsClient called from a server context. " +
        "Use bccFetch() with an explicit token from getServerSession(authOptions) instead."
    );
  }

  const session = await getSession();
  const hadSessionToken =
    session !== null && typeof session.bccToken === "string" && session.bccToken !== "";
  // The session JWT can outlive the BCC bearer (auth.ts blanks
  // session.bccToken once bccTokenExpiresAt is past). Treat that
  // case the same as a 401 — clear the now-useless NextAuth session
  // so subsequent client calls go fully anonymous.
  const sessionExpired =
    session !== null &&
    typeof session.bccTokenExpiresAt === "number" &&
    Date.now() >= session.bccTokenExpiresAt;

  if (sessionExpired) {
    await signOut({ redirect: false });
  }

  try {
    return await bccFetch<T>(path, {
      ...options,
      token: session?.bccToken ?? null,
    });
  } catch (err) {
    // 401 + we DID send a token → the server rejected our JWT (expired,
    // revoked, signature mismatch). Clear the dead NextAuth session so
    // the next call doesn't reuse the stale token and 401 again.
    // We don't redirect here — that's the caller's call (typically
    // a route-level error boundary or React Query's onError).
    if (err instanceof BccApiError && err.status === 401 && hadSessionToken) {
      await signOut({ redirect: false });
    }
    throw err;
  }
}
