/**
 * BCC API error helpers — thin, deliberately small.
 *
 * Phase γ doctrine: machine behavior MUST branch on `err.code`, never on
 * `err.message`. Human-readable strings are presentation only; the
 * server's English copy is free to change, but the code surface is part
 * of the public contract (§L5 of `docs/api-contract-v1.md`).
 *
 * This module is two functions. There is no central copy registry —
 * each call site owns its own copy map because UX copy evolves per
 * surface (settings vs composer vs auth). What we centralize is the
 * branching primitive (`isCode`) and the safe code→copy lookup
 * (`humanizeCode`) that REFUSES to fall back to `err.message`.
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
