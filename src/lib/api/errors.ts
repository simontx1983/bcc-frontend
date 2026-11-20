/**
 * BCC API error helpers — thin, deliberately small.
 *
 * Phase γ doctrine: machine behavior MUST branch on `err.code`, never on
 * `err.message`. Human-readable strings are presentation only; the
 * server's English copy is free to change, but the code surface is part
 * of the public contract (§L5 of `docs/api-contract-v1.md`).
 *
 * This module is a handful of small predicates/helpers. There is no central
 * copy registry — each call site owns its own copy map because UX copy
 * evolves per surface (settings vs composer vs auth). What we centralize
 * is the branching primitive (`isCode`), the safe code→copy lookup
 * (`humanizeCode`) that REFUSES to fall back to `err.message`, and one
 * two retryability predicates — `isPermissionDenial` (valid for any
 * read, paged included) and the narrower
 * `isNonRetryableFixedReadFailure` (fixed reads only).
 *
 * The safety property: every UI string returned by `humanizeCode` is
 * either authored at the call site or the explicit `defaultCopy`
 * argument. The server's `error.message` is never user-visible through
 * this helper. That preserves the §Phase γ rule even when the server's
 * copy drifts.
 *
 * Anti-pattern this replaces (do not re-introduce):
 *     return err.message !== "" ? err.message : "Couldn't save.";
 *
 * Canonical replacement:
 *     return humanizeCode(err, {
 *       bcc_unauthorized: "Sign in to save these preferences.",
 *       bcc_rate_limited: "Saving too fast — try again in a moment.",
 *     }, "Couldn't save these preferences. Try again.");
 */

import { BccApiError } from "@/lib/api/types";

/**
 * Type-narrowing predicate: did this `unknown` come back as a BCC
 * envelope error with the given stable `code`?
 *
 * Use at branch points where one specific error code unlocks a special
 * UI path (e.g. `bcc_unauthorized` → redirect to /login). For multi-
 * code copy mapping, prefer `humanizeCode`.
 */
export function isCode(err: unknown, code: string): boolean {
  return err instanceof BccApiError && err.code === code;
}

/**
 * The server's wait on a rate-limit 429, in whole seconds, or null when it
 * sent none (or an unusable value). Contract §1.4.4 (v1.176, F-289):
 * `data.retry_after_seconds` is the time LEFT on the limit that refused.
 */
export function retryAfterSeconds(err: unknown): number | null {
  if (!isCode(err, "bcc_rate_limited")) return null;
  const hinted = (err as BccApiError).data?.["retry_after_seconds"];
  return typeof hinted === "number" && Number.isFinite(hinted) && hinted > 0 ? hinted : null;
}

/**
 * Codes for which re-issuing an *identical* read cannot succeed, so a
 * failure state must not offer a Retry control. A button that fails the
 * same way on every press is worse than no button.
 *
 * **"Fixed" is load-bearing in the name.** This is only correct for a
 * read whose request cannot vary between attempts — no page argument,
 * no filters, no user input. `bcc_invalid_request` is terminal *because*
 * the identical request will be rejected identically; give the caller a
 * way to change the request and it stops being terminal.
 *
 *   - `bcc_forbidden` (403) — permission boundary; unchanged by repetition.
 *   - `bcc_not_found` (404) — the resource is gone.
 *   - `bcc_invalid_request` (400) — the request itself is rejected, so an
 *     identical retry repeats the same failure.
 *
 * Deliberately NOT here:
 *
 *   - `bcc_unauthorized` (401) — authentication can recover externally
 *     (a session refreshed in another tab), after which the same request
 *     genuinely succeeds.
 *   - `bcc_rate_limited`, `bcc_unavailable`, `bcc_internal_error`,
 *     `bcc_peepso_unavailable` — transient by definition.
 *
 * **Only valid for reads whose request cannot change between attempts.**
 * If a call site can repair or vary the request — different page, edited
 * filters, corrected input — `bcc_invalid_request` may be recoverable
 * there and this predicate is the wrong tool; branch explicitly instead.
 */
/**
 * A PERMISSION boundary: "you may not read this", as distinct from
 * "this read did not complete".
 *
 * Correct for **any** read, paged or fixed, which is what makes it the
 * right tool where `isNonRetryableFixedReadFailure` is the wrong one. A
 * permission boundary does not move when the request's page, cursor or
 * filters change, so repetition cannot cross it. The codes that predicate
 * adds — `bcc_not_found` and `bcc_invalid_request` — are NOT terminal on
 * a paged read: a stale `?page=200` answers 404 or 400 and PREV repairs
 * it, so treating those as permanent on a pager would hide the way back.
 *
 * The three codes are the permission members of the contract's own
 * non-retryable client-error class (§1.4.2: "No — the request is wrong;
 * show UX, do not retry"), which lists `bcc_invalid_request`,
 * `bcc_permission_denied`, `bcc_blocked` and `bcc_forbidden`:
 *
 *   - `bcc_forbidden` (403)         — authenticated, not the owner (§1.4)
 *   - `bcc_permission_denied` (403) — authenticated, gate not met (§1.4)
 *   - `bcc_blocked` (403)           — blocked by the subject
 *
 * ⚠ Only `bcc_forbidden` was previously listed anywhere, so a
 * `bcc_permission_denied` or `bcc_blocked` read offered a Retry that
 * could never succeed. `NON_RETRYABLE_FIXED_READ_CODES` below is now
 * composed from this set so the two cannot drift apart again.
 *
 * This is the predicate form of the branch `WatchingPanel` already makes
 * by hand (`queryError.code === "bcc_permission_denied"` → render the
 * private empty state, no Retry). That call site keeps its bespoke
 * branch because it maps denial onto a *domain* meaning (privacy);
 * callers that only need "is a Retry honest here" use this.
 */
const PERMISSION_DENIAL_CODES: ReadonlySet<string> = new Set([
  "bcc_forbidden",
  "bcc_permission_denied",
  "bcc_blocked",
]);

export function isPermissionDenial(err: unknown): boolean {
  return err instanceof BccApiError && PERMISSION_DENIAL_CODES.has(err.code);
}

/**
 * The profile owner's `profile_visibility` does not admit this viewer
 * (contract v1.91): `bcc_forbidden` 403 with `error.data.reason ===
 * "profile_private"`, on `GET /users/:handle` and its per-user siblings.
 *
 * ⚠ The same routes also answer `bcc_permission_denied` 403, which is about
 * the VIEWER's own standing (or `watching_hidden` on the follow lists). That
 * one keeps its own UI, so branch on code AND reason, never on status.
 *
 * Not a failure from the viewer's point of view: render a calm "this
 * profile is private" state, never an alert and never a Retry.
 */
export function isProfilePrivate(err: unknown): boolean {
  return (
    err instanceof BccApiError &&
    err.code === "bcc_forbidden" &&
    err.data?.["reason"] === "profile_private"
  );
}

/**
 * React Query `retry` for the per-user profile reads: the app-wide single
 * retry, except that a private profile is answered after ONE request. The
 * owner's setting does not change between two attempts a second apart.
 */
export function retryUnlessProfilePrivate(failureCount: number, err: unknown): boolean {
  return !isProfilePrivate(err) && failureCount < 1;
}

/**
 * Pauses before each retry of a rate-limited read. bcc-trust #716 throttles
 * `GET /cards?q=` at 10 requests per 5 s per caller, so a 429 means "wait
 * for the window to roll", and the app-wide retry (once, after 1 s) would
 * usually land inside the same window and show a load failure. These add
 * up to 12 s: past two full windows.
 */
export const RATE_LIMIT_RETRY_DELAYS_MS: readonly number[] = [2_000, 4_000, 6_000];

/** Added to the server's `retry_after_seconds` before retrying. */
const RETRY_AFTER_MARGIN_MS = 250;

/**
 * React Query `retry` for reads that can be rate-limited: a 429 is retried
 * after a pause (RATE_LIMIT_RETRY_DELAYS_MS) instead of becoming a load
 * failure; any other error keeps the app-wide single retry.
 */
export function retryRateLimitedRead(failureCount: number, err: unknown): boolean {
  if (isCode(err, "bcc_rate_limited")) {
    // #328 review: a wait longer than the retry cap cannot succeed early,
    // so a capped retry would be refused again. Fail now; the failure copy
    // says to give it a moment.
    const hinted = retryAfterMs(err);
    if (hinted !== null && hinted > RETRY_AFTER_CAP_MS) return false;
    return failureCount < RATE_LIMIT_RETRY_DELAYS_MS.length;
  }
  return failureCount < 1;
}

/** The server's `data.retry_after_seconds` in ms, or null when absent or unusable. */
function retryAfterMs(err: unknown): number | null {
  const hinted = err instanceof BccApiError ? err.data?.["retry_after_seconds"] : undefined;
  return typeof hinted === "number" && Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : null;
}

/** Longest single wait before a retry. */
const RETRY_AFTER_CAP_MS = 30_000;

/** React Query `retryDelay` to pair with retryRateLimitedRead. */
export function rateLimitedRetryDelay(failureCount: number, err: unknown): number {
  if (isCode(err, "bcc_rate_limited")) {
    // Contract §1.4.4 (v1.176, F-289): a rate limit's 429 carries
    // `data.retry_after_seconds`, the time LEFT on the limit that refused.
    // Wait that (plus a small margin for clock and network); without it,
    // the fixed pauses.
    const hinted = retryAfterMs(err);
    if (hinted !== null) return Math.min(hinted + RETRY_AFTER_MARGIN_MS, RETRY_AFTER_CAP_MS);
    return RATE_LIMIT_RETRY_DELAYS_MS[Math.min(failureCount, RATE_LIMIT_RETRY_DELAYS_MS.length - 1)] ?? 2_000;
  }
  // React Query's own default backoff.
  return Math.min(1000 * 2 ** failureCount, 30_000);
}

const NON_RETRYABLE_FIXED_READ_CODES: ReadonlySet<string> = new Set([
  ...PERMISSION_DENIAL_CODES,
  "bcc_not_found",
  "bcc_invalid_request",
]);

export function isNonRetryableFixedReadFailure(err: unknown): boolean {
  return err instanceof BccApiError && NON_RETRYABLE_FIXED_READ_CODES.has(err.code);
}

/**
 * The read did not run, so it says nothing about the resource: show
 * "temporarily unavailable" with a Retry, never "not found".
 *
 *   - `bcc_unavailable`: the server's own answer (contract "Feed read
 *     failure", F-275).
 *   - Any 503, whatever the code. A 503 from the host or a proxy (a
 *     LiteSpeed HTML page, say) never reaches the BCC envelope, so the
 *     client labels it `bcc_invalid_response` (non-JSON body) or
 *     `bcc_unexpected_status` (JSON, no envelope). Only the status says
 *     what happened.
 *
 * Other 5xx are left to each call site: a 500 is not a promise that the
 * same read will work shortly.
 */
export function isServiceUnavailable(err: unknown): boolean {
  return err instanceof BccApiError && (err.code === "bcc_unavailable" || err.status === 503);
}

/**
 * Map a BccApiError onto call-site-owned copy without ever leaking the
 * server's `error.message` through to the UI.
 *
 * If `err` is a BccApiError whose `.code` is present in `copyMap`,
 * returns the mapped copy. Otherwise returns `defaultCopy` verbatim —
 * including when `err` is not a BccApiError at all (network failures,
 * thrown plain Errors, etc.).
 *
 * The deliberate absence of an `err.message` fallback is the whole
 * point: presentation copy is owned at the call site, not by the
 * server. If a new server code surfaces that the call site cares
 * about, add it to that call site's `copyMap`.
 */
export function humanizeCode(
  err: unknown,
  copyMap: Record<string, string>,
  defaultCopy: string,
): string {
  if (err instanceof BccApiError) {
    const mapped = copyMap[err.code] ?? copyMap[copyCodeFallback(err.code) ?? ""];
    if (typeof mapped === "string") {
      return mapped;
    }
  }
  return defaultCopy;
}

/**
 * Codes that read as another code's copy when a call site has no entry of
 * its own. bcc-trust F-288: a 401 on a route that requires sign-in now says
 * WHY — `bcc_token_expired` or `bcc_token_invalid` instead of
 * `bcc_unauthorized`. For the member it is the same situation ("sign in
 * again"), so every copyMap written against `bcc_unauthorized` keeps
 * working without editing each call site.
 */
const COPY_CODE_FALLBACK: Readonly<Record<string, string>> = {
  bcc_token_expired: "bcc_unauthorized",
  bcc_token_invalid: "bcc_unauthorized",
};

function copyCodeFallback(code: string): string | null {
  return COPY_CODE_FALLBACK[code] ?? null;
}
