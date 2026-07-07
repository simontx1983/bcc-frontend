import Image from "next/image";
import Link from "next/link";

import { LegalTabs } from "@/components/legal/LegalTabs";
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
 * classes, same 45px size) so it reads as "the same header," just a
 * single slim row (no fixed height — it's sized by its own padding, same
 * order of magnitude as --bcc-header-h) with the doc tabs on the right.
 * Wraps to a second row on narrow viewports rather than collapsing into a
 * hamburger — three short tab labels don't need a drawer.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bcc-legal-shell min-h-screen" style={{ background: "var(--bcc-bg)" }}>
      <div
        className="sticky top-0 z-10 border-b border-[var(--bcc-border)]"
        style={{ background: "var(--bcc-surface)" }}
      >
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-2 sm:px-8">
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
            <LegalTabs />
            <LegalThemeToggle />
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
