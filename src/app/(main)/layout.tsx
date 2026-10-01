/**
 * (main) — the shared root every (main) sibling group hangs off.
 *
 * The visual chrome used to live here, but a child layout can only ADD to
 * what an ancestor renders, never remove it, so it had to move down into
 * the (app) group: (detail) and (marketing) are siblings of (app), not
 * children, and need to render their OWN (bare/mobile) chrome instead of
 * inheriting SiteHeader/AppShell/MobileShell unconditionally.
 *
 * `AuthRedirectNotice` is the one thing that does belong here, and it was
 * previously mounted in AppShell — which broke the sign-out explanation
 * for the only audience that ever sees it. `endSession` carries its reason
 * across the teardown navigation as `/?authNotice=<slug>`, and after a
 * sign-out the viewer is ANONYMOUS, so `/` resolves to (marketing), whose
 * layout deliberately does not render AppShell. Browser-measured: landing
 * on `/?authNotice=standing` while signed out showed no notice and did not
 * even scrub the param, because nothing was mounted to read it.
 *
 * The pre-existing slugs hid this. `login`, `signup` and `forgot-password`
 * are bounces that only an ALREADY-AUTHENTICATED visitor can trigger, and
 * they land in (app) — so AppShell was always mounted for them.
 *
 * Here it is mounted exactly once for (app), (detail) and (marketing)
 * alike. It is `fixed`-positioned and self-wraps in Suspense, so it needs
 * nothing from the chrome around it.
 */
import { AuthRedirectNotice } from "@/components/auth/AuthRedirectNotice";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <AuthRedirectNotice />
    </>
  );
}
