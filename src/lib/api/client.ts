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
  // FormData bodies (file uploads) need different handling: the browser
  // sets the multipart Content-Type with the correct boundary itself, and
  // we must NOT JSON.stringify. Detect by instance check rather than a
  // separate flag so callers just pass FormData and it Just Works.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) {
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
    init.body = isFormData ? (body as FormData) : JSON.stringify(body);
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
  const sessionToken =
    session !== null && typeof session.bccToken === "string" && session.bccToken !== ""
      ? session.bccToken
      : null;
  const hadSessionToken = sessionToken !== null;
  // The session JWT can outlive the BCC bearer (auth.ts blanks
  // session.bccToken once bccTokenExpiresAt is past). When that
  // happens we have a CHANCE to silently refresh the bearer via
  // /auth/refresh (Phase β.3) before the request fires — the
  // server allows REFRESH_GRACE_SECONDS of post-exp window per
  // JwtToken::decodeForRefresh.
  const sessionExpired =
    session !== null &&
    typeof session.bccTokenExpiresAt === "number" &&
    Date.now() >= session.bccTokenExpiresAt;

  let effectiveToken = sessionToken;
  if (sessionExpired && sessionToken !== null) {
    // Pre-emptive refresh: NextAuth says the bearer is dead. Try to
    // mint a fresh one BEFORE the fetch. If refresh succeeds, the
    // SPA never sees a 401; if it fails, signOut and let the call
    // proceed anonymously (the caller will surface whatever the
    // endpoint returns — typically bcc_unauthorized).
    const refreshed = await tryRefresh(sessionToken);
    if (refreshed === null) {
      await signOut({ redirect: false });
      effectiveToken = null;
    } else {
      effectiveToken = refreshed;
    }
  }

  try {
    return await bccFetch<T>(path, {
      ...options,
      token: effectiveToken,
    });
  } catch (err) {
    if (!(err instanceof BccApiError) || err.status !== 401 || !hadSessionToken) {
      throw err;
    }
    // Reactive 401: server rejected our bearer, but NextAuth didn't
    // know it was dead yet. Attempt one refresh-then-retry before
    // signOut. We only do this once — if the retry ALSO 401s, the
    // refresh-then-retry path won't fire again because the retry
    // path uses bccFetch directly (no recursion into bccFetchAsClient).
    const tokenToRefresh = effectiveToken ?? sessionToken;
    if (tokenToRefresh !== null) {
      const refreshed = await tryRefresh(tokenToRefresh);
      if (refreshed !== null) {
        return await bccFetch<T>(path, { ...options, token: refreshed });
      }
    }
    await signOut({ redirect: false });
    throw err;
  }
}

/**
 * Phase β.3 silent-refresh helper. Exchanges a (possibly-expired)
 * Bearer JWT for a fresh one via POST /bcc/v1/auth/refresh.
 *
 * On success:
 *   - Persists the new token + expiresAt into the NextAuth session via
 *     POST /api/auth/session (jwt callback trigger='update'), so the
 *     NEXT bccFetchAsClient call reads the fresh token from getSession.
 *     Session-update failure is non-fatal — the immediate retry still
 *     uses the new token; subsequent calls would just re-refresh.
 *   - Returns the new token string.
 *
 * On any failure: returns null. The caller treats null the same as
 * a hard auth failure (signOut + propagate the original 401).
 *
 * Uses a raw `fetch` directly (NOT bccFetch) so this can be called
 * from inside bccFetchAsClient's 401 handler without recursion risk.
 * Tolerates any response shape that has data.token + data.expires_in.
 */
async function tryRefresh(currentToken: string): Promise<string | null> {
  try {
    const r = await fetch(`${clientEnv.BCC_API_URL}/wp-json/bcc/v1/auth/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${currentToken}`,
        Accept: "application/json",
      },
    });
    if (!r.ok) return null;
    const body = (await r.json().catch(() => null)) as
      | { data?: { token?: unknown; expires_in?: unknown } }
      | null;
    const newToken =
      typeof body?.data?.token === "string" && body.data.token !== ""
        ? body.data.token
        : null;
    const expiresIn =
      typeof body?.data?.expires_in === "number" && body.data.expires_in > 0
        ? body.data.expires_in
        : null;
    if (newToken === null || expiresIn === null) return null;

    const newExpiresAt = Date.now() + expiresIn * 1000;

    // Persist into the NextAuth session so the next getSession() call
    // returns the fresh token instead of repeating the refresh dance.
    //
    // NextAuth 4.x session-write contract (load-bearing):
    //   1. Body MUST include csrfToken read from GET /api/auth/csrf,
    //      otherwise the POST silently no-ops at status 200.
    //   2. The payload to merge into the JWT MUST be wrapped under
    //      `data:` — NextAuth unwraps that and passes it as `session`
    //      to the jwt callback when trigger === 'update'.
    //      (See bcc-frontend/src/lib/auth.ts jwt callback for the
    //      receiving side.)
    //
    // Both gotchas were empirically verified 2026-05-13: omitting either
    // one returns 200 but session.bccToken stays unchanged on the next
    // getSession call. With both, the new token + expiry land in the
    // session within one request cycle.
    //
    // Failure here is non-fatal: the immediate retry still uses the
    // fresh token, and subsequent calls would just re-refresh. The
    // session-update is the optimization that avoids that re-refresh.
    try {
      const csrfResp = await fetch("/api/auth/csrf", { credentials: "include" });
      const csrfBody = (await csrfResp.json().catch(() => null)) as
        | { csrfToken?: unknown }
        | null;
      const csrfToken =
        typeof csrfBody?.csrfToken === "string" ? csrfBody.csrfToken : null;
      if (csrfToken !== null) {
        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            csrfToken,
            data: { bccToken: newToken, bccTokenExpiresAt: newExpiresAt },
          }),
        });
      }
    } catch {
      // Session-update failure is non-fatal — the immediate retry
      // still works because the caller has the fresh token in hand;
      // the cost is one extra refresh round-trip on the next call.
    }

    return newToken;
  } catch {
    return null;
  }
}
