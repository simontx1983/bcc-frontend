import Image from "next/image";
import Link from "next/link";

import { LegalTabs } from "@/components/legal/LegalTabs";
import { LegalTabsMobile } from "@/components/legal/LegalTabsMobile";
import { LegalThemeToggle } from "@/components/legal/LegalThemeToggle";

/**
 * Legal document layout — a public, single-column reading surface for the
 * Terms / Privacy / Cookie pages. Deliberately outside the app shell (no
 * sidebars, no auth card) so long-form legal text reads cleanly. Public:
 * these routes are not in middleware's protected matcher. Uses the
 * theme-aware --bcc-* tokens (not cardstock/ink) — this is app chrome, not
 * a trading-card face. `.bcc-legal-shell` opts the body out of the app
 * shell's scroll lock (see globals.css), same mechanism as .bcc-minimal-shell.
 *
 * Header reuses the main site's .bcc-brand logo/wordmark verbatim (same
 * classes, same 45px size) and is edge-to-edge like .bcc-header (no
 * max-width cap on the row itself — only the article body below is
 * reading-width capped) so logo/nav truly sit at the far left/right, not
 * centered within an inner column. Glass effect follows the blur-layer
 * sibling pattern (see CLAUDE.md) — never put backdrop-filter directly on
 * an element whose children (the theme-toggle dropdown) also need one.
 * Desktop shows the tab strip; narrow viewports swap it for a hamburger
 * (LegalTabsMobile) so the row never needs to wrap.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bcc-legal-shell min-h-screen" style={{ background: "var(--bcc-bg)" }}>
      <div className="sticky top-0 z-10 border-b border-[var(--bcc-header-border)]">
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--bcc-header-bg)",
            backdropFilter: "blur(18px) saturate(140%)",
            WebkitBackdropFilter: "blur(18px) saturate(140%)",
          }}
        />
        <div className="relative z-[1] flex items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <Link href="/" className="bcc-brand">
            <Image
              src="/images/Blue_Collar_Crypto_Logo.png"
              alt="Blue Collar Crypto"
              width={45}
              height={45}
              className="bcc-brand-logo"
              priority
            />
            <span className="bcc-brand-wordmark">
              <span className="bcc-brand-top">Blue Collar</span>
              <span className="bcc-brand-bottom">Crypto</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex">
              <LegalTabs />
            </div>
            <div className="flex sm:hidden">
              <LegalTabsMobile />
            </div>
            <LegalThemeToggle />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
