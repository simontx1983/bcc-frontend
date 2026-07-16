import Image from "next/image";
import Link from "next/link";

/**
 * (marketing) — the guest landing page's shell. Bare, full-bleed, no
 * AppShell sidebars — a slim header (logo + Join/Sign in) instead of the
 * full SiteHeader. Modeled on (legal)'s shell: same blur-layer header
 * pattern, and `.bcc-marketing-shell` opts the body out of AppShell's
 * per-column scroll lock the same way `.bcc-legal-shell` does (see
 * globals.css) — the landing scrolls natively, full-bleed.
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
            <Link href="/login" className="bcc-btn bcc-btn-sm bcc-btn-ghost">
              Sign In
            </Link>
            <Link href="/signup" className="bcc-btn bcc-btn-sm bcc-btn-primary">
              Join the Floor
            </Link>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
