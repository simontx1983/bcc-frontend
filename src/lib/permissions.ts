/**
 * Permissions — defensive accessors for server-supplied capability blocks.
 *
 * BCC view-model responses carry per-resource permission objects shaped
 * roughly as:
 *
 *   permissions: {
 *     can_X: { allowed: boolean, unlock_hint: string | null },
 *     can_Y: { ... },
 *     ...
 *   }
 *
 * The TypeScript types in `lib/api/types.ts` declare these fields as
 * REQUIRED for every contract today, and the canonical access pattern
 * is `obj.permissions.can_X.allowed`. That works as long as:
 *
 *   1. The backend never softens the contract (a new resource type that
 *      doesn't expose `can_X` would crash the SPA).
 *   2. The shipped client is in lockstep with the shipped backend.
 *
 * Both assumptions hold for the web SPA today. Neither holds for mobile
 * clients on older app versions hitting a newer backend (or newer mobile
 * clients hitting a stale instance).
 *
 * This helper is the canonical defensive accessor. Components that read
 * server permissions should prefer it over direct chain access so the
 * UI degrades to "action hidden" rather than "render crash" if a field
 * is ever omitted by the server.
 *
 * Pattern:
 *
 *   // Before (crashes if can_join missing):
 *   if (group.permissions.can_join.allowed) { ... }
 *
 *   // After (degrades to false if either link is missing):
 *   if (isAllowed(group.permissions, "can_join")) { ... }
 *
 * Where the caller specifically needs the unlock hint string (e.g. to
 * render a "Locked: ${hint}" copy line), `unlockHint()` returns the
 * narrowed nullable value with the same optional-chain defense.
 *
 * @see stabilization-plan-2026-05-13.md Phase β / item 4
 * @see docs/operational-audit-2026-05-13.md Section C — coupling audit
 */

/**
 * Returns true ONLY if the server explicitly granted the capability.
 *
 * The parameter is typed `unknown` deliberately. BCC's contract types
 * declare each `permissions` block as a strict named interface with
 * required `can_*` fields (MemberPermissions, GroupPermissions,
 * CardPermissions, etc.). The helper's job is to survive cases where
 * the actual response diverges from the type — a mobile client on an
 * older app version hitting a newer backend, a new resource type that
 * doesn't include a particular capability, or a partial response from
 * a degraded service. Accepting `unknown` keeps the call sites narrow
 * (`isAllowed(profile.permissions, "can_block")`) while the helper's
 * body proves defensively that the lookup is safe.
 *
 * Missing map, missing capability, missing `allowed` flag, or any
 * non-boolean-true value all collapse to false.
 *
 * The strict `=== true` check matches the server contract: `allowed`
 * is documented as a boolean, and truthy values like `1` or `"true"`
 * should not be honored — those would signal contract drift.
 */
export function isAllowed(permissions: unknown, capability: string): boolean {
  if (typeof permissions !== "object" || permissions === null) {
    return false;
  }
  const entry = (permissions as Record<string, unknown>)[capability];
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  return (entry as { allowed?: unknown }).allowed === true;
}

/**
 * Returns the unlock-hint string for a capability when one is present
 * and non-empty; null otherwise. Use to render copy like "Locked: hold
 * 5 NFTs from this collection to join" without first verifying the
 * field exists.
 *
 * Same defensive posture as `isAllowed`: accepts `unknown` and validates
 * the chain at each step.
 */
export function unlockHint(permissions: unknown, capability: string): string | null {
  if (typeof permissions !== "object" || permissions === null) {
    return null;
  }
  const entry = (permissions as Record<string, unknown>)[capability];
  if (typeof entry !== "object" || entry === null) {
    return null;
  }
  const hint = (entry as { unlock_hint?: unknown }).unlock_hint;
  if (typeof hint !== "string" || hint === "") {
    return null;
  }
  return hint;
}
