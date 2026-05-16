/**
 * Site-wide nav config — single source of truth.
 *
 * Imported by SiteHeader (rendering the primary strip + OPS pop) and
 * SiteFooter (mirroring the full index). Adding a top-level route
 * means adding one row here and deciding which tier it belongs to.
 *
 * Tier rationale (2026-05-11 redesign):
 *
 *   PRIMARY — daily-driver destinations. Render inline at all sm+ sizes
 *             in the main nav strip. Keep this list at 4 max — the 5th
 *             primary link starts to crowd the action cluster at 1024px.
 *
 *   SPECIALIST — identity-load-bearing but lower-frequency. Collapse
 *                behind the OPS pop-row on desktop; appear under the
 *                "OPS" caption in the mobile sheet. Active-state still
 *                surfaces on the OPS trigger so users navigating WITHIN
 *                a specialist surface don't feel lost.
 *
 *   Messages is intentionally NOT in either tier — the MessagesBadge in
 *             the action cluster is the canonical entry point. A nav-link
 *             that targets the same route was double-counting the
 *             affordance and crowding the primary strip.
 *
 * `match` rule for active state:
 *   - null  → exact match against "/" (the Floor)
 *   - "/x"  → active when pathname === "/x" or starts with "/x/"
 *
 * Broadcast was retired (v1.5): the Floor's `signals` scope tab
 * already covers "live rolling feed of trades / validations / dispute
 * outcomes / signals," and with v1.5 reactions + comments the Floor
 * is the daily driver.
 */

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly match: string | null;
}

/** Tier 1 — daily-driver destinations. Render inline at sm+. */
export const PRIMARY_NAV: readonly NavLink[] = [
  { label: "The Floor",   href: "/",            match: null },
  { label: "Directory",   href: "/directory",   match: "/directory" },
  { label: "Communities", href: "/communities", match: "/communities" },
  { label: "Watching",    href: "/watching",    match: "/watching" },
] as const;

/** Tier 2 — specialist destinations. Collapse behind OPS popover. */
export const SPECIALIST_NAV: readonly NavLink[] = [
  { label: "Validators", href: "/validators", match: "/validators" },
  { label: "Disputes",   href: "/disputes",   match: "/disputes" },
  { label: "Members",    href: "/members",    match: "/members" },
] as const;

/**
 * Legacy concatenation for SiteFooter (which still wants the full
 * flat list). Don't read this from header components — they should
 * import PRIMARY_NAV / SPECIALIST_NAV directly so the tier intent is
 * preserved at the call site.
 */
export const SITE_NAV: readonly NavLink[] = [
  ...PRIMARY_NAV,
  ...SPECIALIST_NAV,
  { label: "Messages", href: "/messages", match: "/messages" },
] as const;

/** Pathname → human label for the rail "BCC // <LABEL>" readout. */
export function railLabelForPath(pathname: string): string {
  if (pathname === "/") return "The Floor";
  if (pathname.startsWith("/u/")) return "Member Profile";
  if (pathname.startsWith("/directory")) return "Directory";
  if (pathname.startsWith("/communities")) return "Communities";
  if (pathname.startsWith("/watching")) return "Watching";
  if (pathname.startsWith("/binder")) return "Watching";
  if (pathname.startsWith("/validators")) return "Validators";
  if (pathname.startsWith("/disputes")) return "Disputes";
  if (pathname.startsWith("/members")) return "Members";
  if (pathname.startsWith("/messages")) return "Messages";
  if (pathname.startsWith("/onboarding")) return "Onboarding";
  if (pathname.startsWith("/login")) return "Sign In";
  if (pathname.startsWith("/signup")) return "Sign Up";
  if (pathname.startsWith("/panel")) return "Panel Duty";
  if (pathname.startsWith("/settings")) return "Settings";
  return "BCC";
}

export function isNavLinkActive(link: NavLink, pathname: string): boolean {
  if (link.match === null) return pathname === "/";
  return pathname === link.match || pathname.startsWith(link.match + "/");
}
