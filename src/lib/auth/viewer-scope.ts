/**
 * viewer-scope — which viewer a stored value belongs to.
 *
 * ## What this is for, and what it is NOT
 *
 * Browser storage is shared by everyone who uses the browser profile. Four
 * families of keys used to be stored unscoped, so whatever the previous
 * viewer left behind was read back and DISPLAYED to whoever signed in
 * next: their recent searches rendered verbatim in the search dropdown,
 * their tour position suppressing or mis-placing someone else's
 * onboarding, their dismissals applying to a different account.
 *
 * Scoping the keys by viewer id fixes that. It prevents CROSS-ACCOUNT
 * DISPLAY — the app will never read one viewer's value while another is
 * signed in.
 *
 * ⚠ It is NOT a privacy guarantee and not a security boundary. Everything
 * here is plain `localStorage` / `sessionStorage` on a shared browser
 * profile: anyone with devtools, or any script already running on the
 * origin, can read every scope regardless of its key. A viewer id in the
 * key is a routing label, not protection. The protections that do hold are
 * elsewhere — the departure sweep removes the departing viewer's values,
 * and nothing private is stored here that the server would not also
 * re-serve to that same viewer.
 *
 * ## Why ids are not migrated
 *
 * Legacy unscoped values are DELETED, never renamed into a scope. The
 * alternative — adopting `bcc-recent-searches` as the first viewer who
 * happens to sign in after the upgrade — would hand one person's search
 * history to another, which is the exact defect this module exists to
 * remove. Losing a tour position is the cheaper error.
 *
 * ## Unknown vs anonymous
 *
 * `null` means "we do not know who this is yet" (the session is still
 * loading). Reads return the default and writes are dropped, because
 * guessing would either leak across accounts or silently misfile data.
 * `ANON_SCOPE` is a real scope for a genuinely signed-out visitor, so an
 * anonymous person's recent searches stay out of every account's scope.
 */

/** The scope for a visitor who is signed out. */
export const ANON_SCOPE = "anon";

/**
 * A resolved storage scope: a viewer id, the anonymous scope, or `null`
 * for "not known yet".
 */
export type ViewerScope = string | null;

/**
 * Resolve the scope from what `useSession()` reports. Call sites pass this
 * explicitly so every read and write shows whose data it touches.
 */
export function resolveViewerScope(
  status: "loading" | "authenticated" | "unauthenticated",
  viewerId: string | null | undefined,
): ViewerScope {
  if (status === "loading") {
    return null;
  }
  if (status === "authenticated" && typeof viewerId === "string" && viewerId !== "") {
    return viewerId;
  }
  // Authenticated but with no usable id is "unknown", not anonymous: it
  // must not fall through to a shared bucket.
  return status === "unauthenticated" ? ANON_SCOPE : null;
}

/**
 * The storage key for `base` within `scope`, or `null` when the scope is
 * unknown — in which case the caller must not read or write.
 *
 * The separator is `::` because two of the bases already contain `.`
 * (`bcc.communities.dismissed`) and one viewer id form could contain `:`;
 * `::` keeps `startsWith(base + "::")` an unambiguous test for "a scoped
 * key of this family", which the departure sweep relies on.
 */
export function scopedKey(base: string, scope: ViewerScope): string | null {
  if (scope === null) {
    return null;
  }
  return `${base}::${scope}`;
}

/** The prefix every scoped key of a family shares. */
export function scopePrefix(base: string): string {
  return `${base}::`;
}

/**
 * Is `key` this family's — either the legacy unscoped name or any scope's?
 *
 * Used by the sweeps, which enumerate the store and so cannot know the
 * scopes they will meet.
 */
export function isKeyInFamily(key: string, base: string): boolean {
  return key === base || key.startsWith(scopePrefix(base));
}

/**
 * Is `key` this family's AND this scope's (or the legacy unscoped name)?
 *
 * The departure sweep's test. With a `null` scope it matches the legacy
 * name only, which is the correct conservative answer: we cannot name a
 * scope, so we remove only what belongs to nobody.
 */
export function isKeyInFamilyForScope(
  key: string,
  base: string,
  scope: ViewerScope,
): boolean {
  return key === base || key === scopedKey(base, scope);
}

/**
 * The unscoped keys written by versions before this change.
 *
 * Deleted on sight, never adopted. Listed explicitly rather than derived,
 * so removing a family from the app does not silently orphan its legacy
 * values.
 */
export const LEGACY_UNSCOPED_KEYS: readonly string[] = [
  "bcc-recent-searches",
  "bcc-tour-seen",
  "bcc-tour-progress",
  "bcc-tour-dismissed",
  "bcc-onboarding-progress",
  "bcc-onboarding-resume-dismissed",
  "bcc.communities.dismissed",
];

/**
 * Legacy key FAMILIES whose names were not knowable up front, because the
 * old scheme appended something to them.
 *
 * `bcc.blog.draft.<handle>` held an unpublished post body keyed by the
 * author's handle — nearly scoped, but with two defects this change
 * removes: the handle fell back to the literal `anon` whenever the session
 * had not resolved yet, so one person's draft body could be restored into
 * another person's composer; and a handle is renameable and reclaimable,
 * so the key does not durably name its owner.
 *
 * ⚠ These are DELETED, and that loses an autosaved draft body that was
 * mid-write when the browser last ran the old code. A draft is worth more
 * than a tour position, so this is the most expensive thing the migration
 * discards — but the alternatives are worse: renaming `…draft.anon` into a
 * scope hands one person's writing to another, and renaming
 * `…draft.<handle>` is only as trustworthy as the handle, which can have
 * changed hands since. The composer's unsaved state is unaffected; this is
 * the 5-second autosave BACKUP, and only a draft abandoned before the
 * upgrade is affected.
 *
 * The scoped replacement (`bcc.blog.draft::<id>`) does not match this
 * prefix: the separator differs at the 15th character (`::` vs `.`).
 */
export const LEGACY_UNSCOPED_PREFIXES: readonly string[] = [
  "bcc.blog.draft.",
];

/**
 * Remove every legacy unscoped value from both stores.
 *
 * Safe to call repeatedly and from any session state, including anonymous:
 * it only ever deletes, and what it deletes belongs to nobody we can
 * identify. Called on every viewer establishment, which covers an
 * in-place sign-in AND a document-load arrival such as OAuth — the arrival
 * that the previous purge mechanism never reached.
 *
 * Returns the number of keys actually removed, for tests and for the one
 * log line the migration note mentions.
 */
export function purgeLegacyUnscopedKeys(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  let removed = 0;
  for (const store of [window.localStorage, window.sessionStorage]) {
    // Enumerate first, then delete: removing while iterating by index
    // re-indexes the store and skips keys.
    let present: string[];
    try {
      present = Object.keys(store);
    } catch {
      // Storage can throw outright in private modes and with site data
      // blocked. Nothing here is load-bearing enough to fail over.
      continue;
    }
    for (const key of present) {
      if (!isLegacyUnscopedKey(key)) continue;
      try {
        store.removeItem(key);
        removed += 1;
      } catch {
        // As above.
      }
    }
  }
  return removed;
}

/**
 * The one test for "this value predates viewer scoping".
 *
 * Shared by the migration above and by the arrival sweep in
 * `viewer-storage`, so there is a single definition of what legacy means.
 */
export function isLegacyUnscopedKey(key: string): boolean {
  return (
    LEGACY_UNSCOPED_KEYS.includes(key) ||
    LEGACY_UNSCOPED_PREFIXES.some((p) => key.startsWith(p))
  );
}
