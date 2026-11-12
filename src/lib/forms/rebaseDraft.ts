/**
 * rebaseDraft — carry a form's unsaved edits across a change to the
 * server copy it was drafted from (H4).
 *
 * Settings forms keep a local draft seeded from a React Query cache entry
 * and re-seed it whenever that entry changes, so another tab's save shows
 * up. Re-seeding by REPLACING the draft threw away whatever the member had
 * changed but not saved yet, whenever something else on the page wrote to
 * the same cache entry: the Mentor toggle saving instantly on the Privacy
 * tab, or "Enable push" on the Notifications tab.
 *
 * Three-way merge, field by field (recursing into plain objects such as
 * `bell` / `push`):
 *   - the member has NOT touched the field (draft === previous base):
 *     take the new server value;
 *   - the member HAS changed it: keep their edit.
 *
 * The result has the new base's shape: keys the server dropped are gone,
 * keys it added appear. Arrays and other non-plain values are compared by
 * value and treated as a single field.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => sameValue(x, b[i]));
  }
  return false;
}

export function rebaseDraft<T>(prevBase: T, nextBase: T, draft: T): T {
  if (isPlainObject(prevBase) && isPlainObject(nextBase) && isPlainObject(draft)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(nextBase)) {
      out[key] = rebaseDraft(prevBase[key], nextBase[key], draft[key]);
    }
    return out as T;
  }
  return sameValue(draft, prevBase) ? nextBase : draft;
}
