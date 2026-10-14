/**
 * BCC API error helpers — thin, deliberately small.
 *
 * Phase γ doctrine: machine behavior MUST branch on `err.code`, never on
 * `err.message`. Human-readable strings are presentation only; the
 * server's English copy is free to change, but the code surface is part
 * of the public contract (§L5 of `docs/api-contract-v1.md`).
 *
 * This module is four small predicates/helpers. There is no central
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

const NON_RETRYABLE_FIXED_READ_CODES: ReadonlySet<string> = new Set([
  ...PERMISSION_DENIAL_CODES,
  "bcc_not_found",
  "bcc_invalid_request",
]);

export function isNonRetryableFixedReadFailure(err: unknown): boolean {
  return err instanceof BccApiError && NON_RETRYABLE_FIXED_READ_CODES.has(err.code);
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
    const mapped = copyMap[err.code];
    if (typeof mapped === "string") {
      return mapped;
    }
  }
  return defaultCopy;
}
