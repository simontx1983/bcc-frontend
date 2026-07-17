/**
 * (main) — bare passthrough. The visual chrome used to live here, but a
 * child layout can only ADD to what an ancestor renders, never remove it,
 * so it had to move down into the (app) group: (detail) and (marketing)
 * are siblings of (app), not children, and need to render their OWN
 * (bare/mobile) chrome instead of inheriting SiteHeader/AppShell/MobileShell
 * unconditionally. This file stays only as the shared root every (main)
 * sibling group hangs off — nothing to add here today.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
