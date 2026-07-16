import Image from "next/image";
import Link from "next/link";

import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { LEGAL_ROUTES } from "@/lib/legal/config";

/**
 * (marketing) — the guest landing page's shell. Bare, full-bleed, no
 * AppShell sidebars — a slim header (logo + palette + Join/Sign in) instead
 * of the full SiteHeader. Modeled on (legal)'s shell: same blur-layer header
 * pattern, and `.bcc-marketing-shell` opts the body out of AppShell's
 * per-column scroll lock the same way `.bcc-legal-shell` does (see
 * globals.css) — the landing scrolls natively, full-bleed.
 *
 * Button order/grammar matches SiteHeader's signed-out state: primary CTA
 * first (left), ghost Sign In second (right) — the landing previously had
 * these reversed. The label itself ("Join the Floor" vs SiteHeader's
 * "Sign Up") stays intentionally different: it's the same `/signup` link,
 * but the landing's copy voice carries the "floor" metaphor used
 * throughout this page (hero CTA, closing CTA) — flattening it to "Sign
 * Up" here would read inconsistently with its own surface, not more
 * consistent with the app shell's.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bcc-marketing-shell min-h-screen" style={{ background: "var(--bcc-bg)" }}>
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
            <ThemeSwitcher />
            <Link href="/signup" className="bcc-btn bcc-btn-sm bcc-btn-primary">
              Join the Floor
            </Link>
            {/* Hidden below 600px — the pair didn't fit the mobile header
                width and Sign In was getting clipped at the viewport edge.
                Same call SiteHeader already makes for its own guest state
                (.bcc-header-signin-btn is desktop-only there too). */}
            <Link href="/login" className="bcc-btn bcc-btn-sm bcc-btn-ghost hidden sm:inline-flex">
              Sign In
            </Link>
          </div>
        </div>
      </div>
      {children}

      {/* Same footer type as the auth pages (MinimalShell) — copyright +
          legal links — but static/end-of-page rather than fixed, since
          this is a long-scrolling page, not a single short-content card. */}
      <footer className="border-t border-[var(--bcc-border-light)] px-4 py-3 sm:px-6">
        <div className="flex flex-col items-center justify-center gap-1.5 sm:flex-row sm:gap-3">
          <CopyrightMark />
          <nav className="flex flex-wrap items-center justify-center gap-3" aria-label="Legal">
            <Link href={LEGAL_ROUTES.terms} className="bcc-legal-link">Terms</Link>
            <Link href={LEGAL_ROUTES.privacy} className="bcc-legal-link">Privacy</Link>
            <Link href={LEGAL_ROUTES.cookies} className="bcc-legal-link">Cookies</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
