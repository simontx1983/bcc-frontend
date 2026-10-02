/**
 * Fetch helper for the bcc-trust/v1 namespace.
 *
 * Differs from `bccFetch` (the standard bcc/v1 client) in the success-
 * envelope shape: bcc-trust/v1 returns `{success: true, data: {...}}`,
 * while bcc/v1 returns `{data, _meta}`. The two envelopes evolved
 * separately and weren't reconciled — code that talks to /bcc-trust/v1
 * routes uses this helper, code that talks to /bcc/v1 uses bccFetch.
 *
 * Auth: bearer JWT from the active NextAuth session. 401s on a
 * previously-valid bearer auto-clear the NextAuth session so the next
 * call goes anonymous instead of looping with a dead token.
 *
 * Consumers:
 *   - lib/api/oauth-endpoints.ts (X / GitHub OAuth)
 *   - lib/api/fingerprint-endpoints.ts (device fingerprint reporter)
 *   - future consumers as the bcc-trust/v1 surface grows
 */

import { getSession } from "next-auth/react";

import { resolveAuthFailure } from "@/lib/api/client";

import { clientEnv } from "@/lib/env";
import { BccApiError } from "@/lib/api/types";

interface BccTrustErrorBody {
  code?: string;
  message?: string;
  data?: { status?: number };
}

interface BccTrustSuccessEnvelope<T> {
  success: true;
  data: T;
}

export interface BccTrustFetchOptions {
  method?: "GET" | "POST" | "DELETE" | undefined;
  body?: unknown;
  signal?: AbortSignal | undefined;
}

export async function bccTrustFetch<T>(
  path: string,
  options: BccTrustFetchOptions = {},
): Promise<T> {
  if (typeof window === "undefined") {
    // No server twin exists yet — the /bcc-trust/v1 namespace has zero
    // SSR consumers today. When the first one appears, add
    // `bccTrustFetchWithSession(session, path, options)` mirroring
    // `bccFetchWithSession` in lib/api/client.ts: extract the bearer
    // from the passed session via the existing tokenFromSession helper,
    // then run the same trust-envelope parse as below without touching
    // next-auth/react.
    throw new Error(
      "[bcc-frontend] bccTrustFetch is client-only. SSR callers: add bccTrustFetchWithSession (mirrors bccFetchWithSession in client.ts).",
    );
  }

  const session = await getSession();
  const token = session?.bccToken ?? null;

  // Mirror bccFetchAsClient's stale-token handling. This used to call
  // signOut() outright whenever NextAuth believed the bearer was past
  // its expiry — ignoring the backend's 24h refresh grace, so a viewer
  // mid-session was logged out for a token the server would still have
  // renewed. Now the refresh endpoint decides, via the shared
  // classifier, and only a definitive rejection ends the session.
  const sessionExpired =
    session !== null &&
    typeof session.bccTokenExpiresAt === "number" &&
    Date.now() >= session.bccTokenExpiresAt;
  let effectiveToken = token;
  if (sessionExpired && token !== null && token !== "") {
    effectiveToken = await resolveAuthFailure(token);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (effectiveToken !== null && effectiveToken !== "") {
    headers["Authorization"] = `Bearer ${effectiveToken}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const url = `${clientEnv.BCC_API_URL}/wp-json/bcc-trust/v1${path}`;

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers,
    // "omit" is load-bearing — identical to client.ts. Sending cookies
    // re-opens three empirically observed production failures on the
    // Vercel→Hostinger/LiteSpeed chain (2026-05-21): a stale wp-admin
    // cookie fires WP cookie-auth before BearerAuth → silent 401; the
    // cookie splits the cache bucket; and the extra header weight can
    // push Authorization over LiteSpeed's HTTP/2 header budget. Bearer
    // JWT is the only credential this API uses.
    credentials: "omit",
  };
  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }
  if (options.signal !== undefined) {
    requestInit.signal = options.signal;
  }

  const response = await fetch(url, requestInit);

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new BccApiError(
      "bcc_invalid_response",
      `Non-JSON response from ${path} (${response.status})`,
      response.status,
      null,
    );
  }

  if (!response.ok) {
    const body = (parsed ?? {}) as BccTrustErrorBody;
    const code = typeof body.code === "string" ? body.code : "bcc_unexpected_status";
    const message =
      typeof body.message === "string" && body.message !== ""
        ? body.message
        : `Unexpected ${response.status} from ${path}`;
    // A 401 on a request that carried a bearer is not proof the session
    // is over: it may be an endpoint-specific denial, a rate limit, or a
    // transient server fault. Ask the refresh endpoint and let the shared
    // classifier decide; it ends the session only on a definitive
    // rejection, and never hands back the refused token.
    if (response.status === 401 && effectiveToken !== null && effectiveToken !== "") {
      await resolveAuthFailure(effectiveToken);
    }
    throw new BccApiError(code, message, response.status, null);
  }

  if (!isTrustEnvelope<T>(parsed)) {
    throw new BccApiError(
      "bcc_invalid_envelope",
      `Response from ${path} did not match the bcc-trust envelope shape`,
      response.status,
      null,
    );
  }
  return parsed.data;
}

function isTrustEnvelope<T>(value: unknown): value is BccTrustSuccessEnvelope<T> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v["success"] === true && "data" in v;
}
