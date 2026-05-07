/**
 * Shared presentation-layer formatters.
 *
 * Date / time formatting is the only client-side derivation that
 * doesn't violate the §A2 "no business logic" rule — it's a UI
 * affordance, not a contract field. Trust scores, tiers, and
 * permissions still come pre-formatted from the server.
 */

/**
 * Format an ISO 8601 UTC timestamp as a relative phrase like "2d" /
 * "3h" / "just now". Bounded resolution — no calendar math beyond
 * 30 days; older shows "Mmm dd".
 */
export function formatRelativeTime(iso: string): string {
  const epoch = Date.parse(iso);
  if (Number.isNaN(epoch)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - epoch) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d`;
  const date = new Date(epoch);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Format an ISO 8601 join timestamp as a "how old is this account"
 * label for directory cards: `3d` / `2w` / `5mo` / `2y`. Distinct from
 * `formatRelativeTime` (which falls through to a non-yeared "Mmm d"
 * past 30 days, ambiguous on directory listings older than 12 months).
 *
 * Bands:
 *   - <60s   → "just now"
 *   - <60m   → "Nm"
 *   - <24h   → "Nh"
 *   - <14d   → "Nd"
 *   - <60d   → "Nw"
 *   - <365d  → "Nmo"
 *   - else   → "Ny"
 *
 * Returns "" for unparseable input — caller suppresses the slot.
 */
export function formatJoinedAge(iso: string): string {
  const epoch = Date.parse(iso);
  if (Number.isNaN(epoch)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - epoch) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 14) return `${Math.floor(seconds / 86400)}d`;
  if (seconds < 86400 * 60) return `${Math.floor(seconds / (86400 * 7))}w`;
  if (seconds < 86400 * 365) return `${Math.floor(seconds / (86400 * 30))}mo`;
  return `${Math.floor(seconds / (86400 * 365))}y`;
}

/** Format an ISO timestamp as "Mmm d, yyyy" in the viewer's locale. */
export function formatShortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a §3.1 ISO 8601 join timestamp as "MON YYYY". UTC-based so
 * server-side render and client-side render don't drift across
 * timezones. Returns "—" for empty / unparseable values.
 */
export function formatJoinDate(iso: string): string {
  if (iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
