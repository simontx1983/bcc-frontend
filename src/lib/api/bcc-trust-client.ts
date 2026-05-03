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
 *   - future: juror panel, endorse UI, etc.
 */

import { getSession, signOut } from "next-auth/react";

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
    throw new Error(
      "[bcc-frontend] bccTrustFetch is client-only. Server-side callers need their own session-aware helper.",
    );
  }

  const session = await getSession();
  const token = session?.bccToken ?? null;

  // Mirror bccFetchAsClient's stale-token short-circuit so a session
  // NextAuth knows is dead doesn't keep fanning out 401s.
  const sessionExpired =
    session !== null &&
    typeof session.bccTokenExpiresAt === "number" &&
    Date.now() >= session.bccTokenExpiresAt;
  if (sessionExpired) {
    await signOut({ redirect: false });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token !== null && token !== "") {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const url = `${clientEnv.BCC_API_URL}/wp-json/bcc-trust/v1${path}`;

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
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
    if (response.status === 401 && token !== null && token !== "") {
      await signOut({ redirect: false });
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
