/**
 * §B6 handle validation — shared between /signup, the login-page wallet-
 * not-linked prompt, and any future surface that needs to validate
 * client-side before posting to the server.
 *
 * Server (HandleService::validate in bcc-trust) is the authoritative
 * validator and will reject anything this misses with `bcc_invalid_handle`,
 * `bcc_handle_reserved`, or `bcc_conflict` (already-taken). This module
 * exists for instant inline feedback only — keep it in lock-step with
 * the server rules at:
 *   app/Domain/Core/Services/HandleService.php
 */

// 3–20 chars, lowercase a–z + 0–9 + '-', no leading/trailing hyphen,
// no consecutive hyphens. Mirrors HandleService::validate().
export const HANDLE_REGEX = /^[a-z0-9](?:(?!--)[a-z0-9-])*[a-z0-9]$/;

// Mirror of HandleService::RESERVED. Surface "@admin is reserved" inline
// instead of waiting for the server roundtrip. Server is still the
// authoritative source for this list — additions happen there first.
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "admin", "administrator", "root", "owner",
  "bcc", "blue-collar", "blue-collar-crypto",
  "support", "help", "contact",
  "system", "api", "null", "undefined",
  "moderator", "mod",
  "login", "signup", "signin", "register", "logout",
  "me", "self", "dashboard", "settings", "about",
]);

export type HandleErrorKind = "too-short" | "too-long" | "format" | "reserved" | null;

/**
 * Local-first validation. Empty input returns null (neutral state, no
 * error message). Server is still the authoritative validator.
 */
export function checkHandleLocal(handle: string): HandleErrorKind {
  if (handle.length === 0) return null;
  if (handle.length < 3) return "too-short";
  if (handle.length > 20) return "too-long";
  if (!HANDLE_REGEX.test(handle)) return "format";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

/**
 * User-facing hint copy for a handle's current state. Returns the
 * neutral format hint when valid (or empty), otherwise a specific
 * actionable message. Callers render this in a `<span>` keyed by
 * whether `kind === null` to drive the success/error styling.
 */
export function formatHandleHint(handle: string, kind: HandleErrorKind): string {
  if (kind === null) {
    return "3–20 chars · a–z, 0–9, hyphens · no leading/trailing/double hyphen";
  }
  if (kind === "too-short") {
    return `Need at least 3 characters (${handle.length} so far).`;
  }
  if (kind === "too-long") {
    return `Max 20 characters (${handle.length} so far).`;
  }
  if (kind === "reserved") {
    return `@${handle} is reserved. Pick something else.`;
  }
  return "Only a–z, 0–9, and hyphens. No leading, trailing, or double hyphens.";
}
