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

import type { Session } from "next-auth";

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
  /**
   * SSR-only Next.js Data Cache revalidation window, in seconds. Set this
   * ONLY for anonymous reads (token === null) — never on authed or
   * otherwise personalized fetches, or a viewer-specific response could be
   * served to other viewers. No-op in the browser (the `next` fetch
   * extension is ignored outside the Next server runtime). Omitted → Next's
   * default for this app, which is uncached (no-store). See lib/api/cache-policy.ts.
   */
  revalidate?: number | undefined;
}

/**
 * Send a request to /wp-json/bcc/v1/{path}, parse the envelope,
 * return `data` on success, throw BccApiError on failure.
 */
export async function bccFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, token, signal, headers: extraHeaders, revalidate } = options;

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

  // `omit` is intentional. The headless cross-origin chain (Vercel
  // frontend → Hostinger WP backend) is Bearer-only — sending WP
  // cookies on these requests adds nothing useful and breaks auth in
  // multiple ways on LiteSpeed:
  //   1. LiteSpeed cache keys vary on Cookie header, so cookie-bearing
  //      requests land in a different cache bucket than cookie-less
  //      ones (Authorization is not in the cache key).
  //   2. With wordpress_logged_in_* cookies present from a prior
  //      wp-admin visit on the WP origin, WordPress's cookie-auth
  //      filter fires before BearerAuth; if the cookie is stale or
  //      from a different user, the result is a silent 401 with no
  //      indication that BearerAuth was even consulted.
  //   3. Combined Cookie + Authorization headers can exceed LiteSpeed's
  //      HTTP/2 per-request header budget, in which case Authorization
  //      is the one that gets dropped (empirically observed 2026-05-21).
  // For same-origin deployments (frontend and WP on the same host),
  // 'omit' still works because BCC is JWT-auth, not cookie-auth — WP's
  // session cookies aren't part of the BCC contract.
  const init: RequestInit = {
    method,
    headers,
    credentials: "omit",
  };
  if (body !== undefined) {
    init.body = isFormData ? (body as FormData) : JSON.stringify(body);
  }
  if (signal !== undefined) {
    init.signal = signal;
  }
  // Anon SSR Data Cache opt-in (F2). `next` is the Next.js fetch extension;
  // typed inline so this server-safe module needs no next/server import.
  // No-op in the browser. Only ever set by anon (token === null) callers.
  if (revalidate !== undefined) {
    (init as RequestInit & { next?: { revalidate: number } }).next = {
      revalidate,
    };
  }

  const response = await fetch(url, init);

  // Phase 4c: the server stamps every BCC response with X-Request-Id (exposed
  // via CORS). Carry it on any error so a frontend failure can be correlated to
  // the backend logs — error envelopes have no _meta, so the header is the link.
  const requestId = response.headers.get("X-Request-Id");

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
      null,
      requestId
    );
  }

  // Error envelope: {error: {code, message, status}, _meta: ...}
  if (isErrorEnvelope(parsed)) {
    throw new BccApiError(
      parsed.error.code,
      parsed.error.message,
      parsed.error.status,
      parsed,
      requestId
    );
  }

  // Non-2xx without proper envelope — unexpected; surface generically.
  if (!response.ok) {
    throw new BccApiError(
      "bcc_unexpected_status",
      `Unexpected ${response.status} response from ${path}`,
      response.status,
      null,
      requestId
    );
  }

  if (!isSuccessEnvelope<T>(parsed)) {
    throw new BccApiError(
      "bcc_invalid_envelope",
      `Response from ${path} did not match the BCC envelope shape`,
      response.status,
      null,
      requestId
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
// the wrong fetch path. Server-side callers use `bccFetchWithSession`
// (or `bccFetch` with an explicit token) — see helpers below.
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

// =====================================================================
// Server-side session-aware wrappers
// =====================================================================
// Mirror of bccFetchAsClient for SSR pages and route handlers. The base
// `bccFetch` already accepts an explicit `token`, but every SSR page
// would otherwise re-derive `session?.bccToken ?? null` itself — these
// helpers centralize that read so the bearer-extraction lives in one
// place (and is the seam where server-side refresh-on-401 will land
// when a real consumer needs it).
//
// `import type { Session }` is type-only and erased at build time —
// no next-auth runtime gets pulled into the client bundle.
//
// bcc-trust-client.ts does not yet have a server twin; add
// `bccTrustFetchWithSession` mirroring this shape when the first SSR
// caller of /bcc-trust/v1 appears.
// =====================================================================

// =====================================================================
// bcc-search raw-response variant
// =====================================================================
// bcc-search endpoints (e.g. /bcc/v1/search/users, /bcc/v1/search/groups,
// /bcc/v1/search?trending=1) predate the §L5 envelope and return raw
// shapes like `{ results, meta }` plus legacy WP error bodies of the form
// `{ code, message, data: { status } }`. Passing those through bccFetch
// would throw `bcc_invalid_envelope` even on a 200, so this sibling
// helper exists for that specific surface.
//
// Behaviour parity with bccFetchAsClient:
//   - Same Bearer-attach (token sent so viewer-aware ranking signals
//     keep working when the user is signed in; the endpoints are public
//     so anon callers also succeed).
//   - Same credentials:'omit' (cross-origin chain).
//   - Same BccApiError contract — code-first, never err.message — so
//     UI error handling per `project_phase_gamma_complete` doesn't fork.
//
// NOT included (deliberately):
//   - Silent JWT refresh on 401 (bcc-search endpoints are public; a 401
//     here would mean an unrelated proxy/WAF failure, not an expired
//     bearer, so retry-then-signOut is the wrong response).
//   - Envelope unwrap (the whole reason for this helper).
//
// If a future bcc-search endpoint adopts the §L5 envelope, migrate its
// caller back to bccFetchAsClient and shrink this helper's footprint.
// =====================================================================
export async function bccSearchFetchAsClient<T>(
  path: string,
  options: Omit<RequestOptions, "token" | "body" | "method"> = {}
): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error(
      "[bcc-frontend] bccSearchFetchAsClient called from a server context. " +
        "bcc-search endpoints are public; SSR pages can use bccFetch with token:null instead."
    );
  }

  const session = await getSession();
  const token =
    session !== null &&
    typeof session.bccToken === "string" &&
    session.bccToken !== ""
      ? session.bccToken
      : null;

  const url = buildUrl(path);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: "GET",
    headers,
    credentials: "omit",
  };
  if (options.signal !== undefined) {
    init.signal = options.signal;
  }

  const response = await fetch(url, init);

  // Phase 4c: correlation id (see bccFetch) — carried on bcc-search errors too.
  const requestId = response.headers.get("X-Request-Id");

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
      null,
      requestId
    );
  }

  if (!response.ok) {
    // Legacy WP error shape: { code, message, data: { status } }.
    // Map to BccApiError so UI code branches on `err.code` uniformly.
    // `responseBody` stays null — the legacy shape isn't an ApiErrorBody
    // and BccApiError.data wouldn't survive the cast anyway; the
    // meaningful info already lives in code/message/status above.
    const legacy = isLegacyWpError(parsed) ? parsed : null;
    throw new BccApiError(
      legacy !== null ? legacy.code : "bcc_search_unavailable",
      legacy !== null
        ? legacy.message
        : `bcc-search ${response.status} on ${path}`,
      response.status,
      null,
      requestId
    );
  }

  return parsed as T;
}

function isLegacyWpError(
  value: unknown
): value is { code: string; message: string; data: { status: number } } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["code"] !== "string") return false;
  if (typeof v["message"] !== "string") return false;
  const data = v["data"];
  if (typeof data !== "object" || data === null) return false;
  return typeof (data as Record<string, unknown>)["status"] === "number";
}

/**
 * Extract the BCC bearer token from a server-fetched NextAuth session.
 *
 * Returns null when the session is null, lacks bccToken, or carries an
 * empty/non-string value. Pages that feed an endpoint wrapper (e.g.
 * getCardEntity(slug, token)) use this instead of inlining
 * `session?.bccToken ?? null` at every call site.
 */
export function tokenFromSession(session: Session | null): string | null {
  if (session === null) return null;
  const t: unknown = session.bccToken;
  return typeof t === "string" && t !== "" ? t : null;
}

/**
 * Session-aware fetch for SSR pages and route handlers. Server mirror
 * of bccFetchAsClient: takes a session fetched via
 * getServerSession(authOptions), extracts the bearer, and forwards to
 * bccFetch.
 *
 * Use this for one-off direct fetches from Server Components. Endpoint
 * wrappers under lib/api/*-endpoints.ts keep their `token: string|null`
 * parameter so the same wrapper works from both client and server
 * callers — those wrappers should be reached via tokenFromSession.
 *
 * Server-side silent refresh is NOT performed. Server Components cannot
 * write back to the NextAuth session cookie cleanly, so an expired
 * bearer surfaces as `bcc_unauthorized` from the endpoint and the page
 * handles it like any other auth-required failure (notFound / redirect).
 */
export async function bccFetchWithSession<T>(
  session: Session | null,
  path: string,
  options: Omit<RequestOptions, "token"> = {}
): Promise<T> {
  return bccFetch<T>(path, { ...options, token: tokenFromSession(session) });
}
