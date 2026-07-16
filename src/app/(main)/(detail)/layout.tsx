"use client";

/**
 * (detail) — post-detail shell. Desktop renders the same chrome as (app)
 * (sidebars still make sense at that width); mobile renders bare, no
 * SiteHeader, no MobileShell — the page's own PostBackButton becomes the
 * full-width header (see PostBackButton's `md:` split) and the comment
 * composer docks as the bottom bar in its place. Item 7.
 *
 * Split on viewport (not a CSS-only hide) because AppShell wraps
 * `{children}` — mounting it and a bare copy of `{children}` side by side
 * to let CSS pick one would double-mount the page (duplicate comment
 * fetch, duplicate composer DOM id, same class of bug fixed in Lightbox).
 * `.bcc-detail-shell` on the bare branch opts the body out of AppShell's
 * per-column scroll lock (see globals.css), same mechanism as
 * `.bcc-legal-shell`/`.bcc-minimal-shell` — the bare page scrolls natively.
 */

import { AppShell } from "@/components/layout/AppShell";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { CelebrationGate } from "@/components/celebration/CelebrationGate";
import { MobileShell } from "@/components/layout/MobileShell";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function DetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="bcc-detail-shell" style={{ background: "var(--bcc-bg)" }}>
        {children}
        <CelebrationGate />
      </div>
    );
  }

  return (
    <>
      <SiteHeader />
      <AppShell>{children}</AppShell>
      <CelebrationGate />
      <MobileShell />
    </>
  );
}
