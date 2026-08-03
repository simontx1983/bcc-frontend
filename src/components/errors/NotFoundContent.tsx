"use client";

/**
 * NotFoundContent — the branded 404 page's client body.
 *
 * Split from `app/not-found.tsx` (a thin server wrapper) purely so the
 * page can still export real `<title>` metadata — a "use client" file
 * can't export `metadata`, same reasoning as the auth pages' server
 * guard / client form split.
 *
 * No header row: logo/wordmark, 404, copy, and CTAs are one centered
 * column — no search, no visible theme toggle. Nobody lingers on a
 * dead-link page long enough to want either; the page still respects
 * whatever theme/accent the visitor already chose elsewhere (mount-time
 * sync, same as every other standalone surface — AuthCard, SiteHeader,
 * MainOffcanvas — independently does; there's no global "apply stored
 * theme" step), it just doesn't expose a control to change it here.
 *
 * `min-height: 100dvh` (not the Tailwind `min-h-screen` = 100vh
 * default) — 100vh on mobile Chrome is measured against the LARGEST
 * possible viewport (address bar hidden), so with the address bar
 * actually showing, real content can run taller than what's visible
 * and push the footer below the fold with no way to scroll to it.
 * 100dvh tracks the toolbar's actual state.
 *
 * Footer renders the same content/markup MinimalShell gives the auth
 * pages and onboarding (CopyrightMark + legal links, `.bcc-auth-footer`
 * classes) but NOT via MinimalShell itself — that shell's CSS
 * (`align-items:center; justify-content:center` on a flex column) is
 * built for a single small centered card, and fighting it is what
 * pushed this page's earlier header-row layout half off-screen.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { LandingEmbers } from "@/components/landing/LandingEmbers";
import { applyTheme, getStoredAccent, getStoredTheme } from "@/lib/theme";
import { LEGAL_ROUTES } from "@/lib/legal/config";

export function NotFoundContent() {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
    applyTheme(getStoredTheme(), getStoredAccent());
  }, []);

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{ minHeight: "100dvh", background: "var(--bcc-bg)" }}
    >
      <LandingEmbers />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-6">
        <div className="flex w-full max-w-lg flex-col items-center text-center">
          <Link
            href="/"
            className="bcc-brand motion-safe:animate-fade-in mb-12 motion-safe:transition-opacity motion-safe:hover:opacity-80"
            aria-label="BCC Home"
          >
            <Image
              src="/images/Blue_Collar_Crypto_Logo.png"
              alt="Blue Collar Crypto"
              width={40}
              height={40}
              className="bcc-brand-logo"
              priority
            />
            {/* text-align:left override — the page wrapper is text-center
                (for the 404/copy below), which the wordmark's two stacked
                lines otherwise inherit, centering "Crypto" under "Blue
                Collar" instead of flush-left with it like every other
                usage (SiteHeader, DemoAuthorCard). */}
            <span className="bcc-brand-wordmark" style={{ textAlign: "left" }}>
              <span className="bcc-brand-top">Blue Collar</span>
              <span className="bcc-brand-bottom">Crypto</span>
            </span>
          </Link>

          <div className="motion-safe:animate-fade-in" style={{ animationDelay: "60ms" }}>
            <h1
              className="bcc-stencil"
              style={{
                fontSize: "clamp(64px, 13vw, 112px)",
                fontWeight: 900,
                lineHeight: 1,
                color: "var(--bcc-accent)",
                letterSpacing: "0.02em",
              }}
            >
              404
            </h1>
          </div>

          <div className="motion-safe:animate-fade-in mt-2" style={{ animationDelay: "120ms" }}>
            <p
              className="bcc-stencil"
              style={{
                fontSize: 20,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--bcc-text)",
              }}
            >
              This page went off the grid.
            </p>
            <p
              className="mt-2 font-serif"
              style={{ fontSize: 15, lineHeight: 1.5, color: "var(--bcc-text-secondary)" }}
            >
              Whatever you were looking for moved, never existed, or the link's just wrong.
              Happens on the Floor too.
            </p>
          </div>

          <div
            className="motion-safe:animate-fade-in mt-7 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "180ms" }}
          >
            <Link href="/" className="bcc-btn bcc-btn-primary">
              Back to the Floor
            </Link>
            {canGoBack && (
              <button type="button" onClick={() => router.back()} className="bcc-btn bcc-btn-ghost">
                Go back
              </button>
            )}
          </div>
        </div>
      </div>

      <footer className="bcc-auth-footer is-revealed" style={{ position: "static" }}>
        <CopyrightMark />
        <nav className="bcc-auth-footer-links" aria-label="Legal">
          <Link href={LEGAL_ROUTES.terms}>Terms</Link>
          <Link href={LEGAL_ROUTES.privacy}>Privacy</Link>
          <Link href={LEGAL_ROUTES.cookies}>Cookies</Link>
        </nav>
      </footer>
    </div>
  );
}
