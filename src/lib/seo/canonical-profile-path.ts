/**
 * Where a `/u/[handle]` request should permanently redirect, or null to
 * render in place.
 *
 * `GET /users/:handle` resolves a member by their current handle, by a
 * RETIRED handle (bcc-trust #540: members whose handle equalled their login
 * were moved to a new one; the old one keeps resolving and is never
 * reassigned) or by `member-{id}` (#557). Every response carries the
 * member's CURRENT `handle`. When that differs from the URL, the URL is an
 * alias: send a 308 to the canonical one, so links and search results
 * converge on a single address.
 *
 * - The comparison ignores case: handles resolve case-insensitively, and
 *   a case-only difference is not worth a redirect hop.
 * - The query string is kept whole (`?tab=…&focus=bio`), so a deep link
 *   still lands where it pointed.
 * - On a backend without #540/#557 nothing changes: a request by the
 *   current handle matches and renders in place.
 */

export type ProfileSearchParams = Record<string, string | string[] | undefined>;

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function canonicalProfilePath(
  requestedHandle: string,
  currentHandle: string,
  searchParams: ProfileSearchParams = {},
): string | null {
  if (currentHandle === "") return null;
  // A dynamic segment may arrive still percent-encoded; compare decoded.
  if (decodeSafely(requestedHandle).toLowerCase() === currentHandle.toLowerCase()) {
    return null;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v);
  }
  const qs = query.toString();
  return `/u/${encodeURIComponent(currentHandle)}${qs === "" ? "" : `?${qs}`}`;
}
