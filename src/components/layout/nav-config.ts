/**
 * Site-wide nav config — single source of truth.
 *
 * Imported by SiteHeader (rendering the strip) and SiteFooter (mirroring
 * the index). Adding a top-level route means adding one row here.
 *
 * `match` rule for active state:
 *   - null  → exact match against "/" (the Floor)
 *   - "/x"  → active when pathname === "/x" or starts with "/x/"
 *
 * Routes that aren't built yet (broadcast/validators/disputes/members)
 * still appear in the nav so the surface matches the prototype. They'll
 * 404 until the matching phase ships — that's intentional, so the nav
 * design lands now and the routes plug in as Phase 5+ work them in.
 */

export interface NavLink {
  readonly label: string;
  readonly href: string;
  readonly match: string | null;
}

export const SITE_NAV: readonly NavLink[] = [
  { label: "The Floor",  href: "/",           match: null },
  { label: "Directory",  href: "/directory",  match: "/directory" },
  { label: "Binder",     href: "/binder",     match: "/binder" },
  { label: "Broadcast",  href: "/broadcast",  match: "/broadcast" },
  { label: "Validators", href: "/validators", match: "/validators" },
  { label: "Disputes",   href: "/disputes",   match: "/disputes" },
  { label: "Members",    href: "/members",    match: "/members" },
] as const;

/** Pathname → human label for the rail "BCC // <LABEL>" readout. */
export function railLabelForPath(pathname: string): string {
  if (pathname === "/") return "The Floor";
  if (pathname.startsWith("/u/")) return "Member Profile";
  if (pathname.startsWith("/directory")) return "Directory";
  if (pathname.startsWith("/binder")) return "Binder";
  if (pathname.startsWith("/broadcast")) return "Broadcast";
  if (pathname.startsWith("/validators")) return "Validators";
  if (pathname.startsWith("/disputes")) return "Disputes";
  if (pathname.startsWith("/members")) return "Members";
  if (pathname.startsWith("/onboarding")) return "Onboarding";
  if (pathname.startsWith("/login")) return "Sign In";
  if (pathname.startsWith("/signup")) return "Sign Up";
  return "BCC";
}

export function isNavLinkActive(link: NavLink, pathname: string): boolean {
  if (link.match === null) return pathname === "/";
  return pathname === link.match || pathname.startsWith(link.match + "/");
}
