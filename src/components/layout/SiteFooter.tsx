/**
 * SiteFooter — global footer slotted under every page.
 *
 * Server component (no state, no effects). Receives `viewerHandle`
 * from the server-side RootLayout so the authed/anon zones can switch
 * on first paint — no flicker, no client round-trip.
 *
 * Redesigned 2026-05-11. Structure:
 *
 *   [ZONE A]  Acquisition strip — anonymous viewers only. Light-touch
 *             "Ready to join?" line + the same Sign In / Join CTAs
 *             the header carries.
 *
 *   [ZONE B]  Three-column index — Platform (PRIMARY_NAV) / Operations
 *             (SPECIALIST_NAV) / Account (authed) or Get Started (anon).
 *             Replaces the flat 8-link sitemap. Each column has a mono
 *             caps label and stencil link rows.
 *
 *   [ZONE C]  System-status row — operational dot + copyright + build
 *             label. The status dot is static today (no hook consumer
 *             exists in bcc-frontend); it's wired as a swap target for
 *             a future useSystemHealth hook.
 *
 *   [ZONE D]  "Member in Good Standing" tilted stamp — contextual.
 *             Only renders when the viewer is authed AND the optional
 *             `viewerInGoodStanding` prop is true. Default behaviour
 *             (prop omitted) shows nothing — the stamp must be earned.
 *
 * The build label uses NEXT_PUBLIC_BCC_BUILD_LABEL with a safe fallback
 * so the rendered string can't go stale. Staleness in user-facing chrome
 * was eating the credibility of the footer's other meta signals.
 */

import type { Route } from "next";
import Link from "next/link";

import {
  PRIMARY_NAV,
  SPECIALIST_NAV,
  type NavLink,
} from "./nav-config";

interface SiteFooterProps {
  /** Logged-in user's BCC handle, or null when anonymous. */
  viewerHandle: string | null;
  /**
   * Whether the signed-in viewer holds the "Member in Good Standing"
   * status. When undefined or false, the stamp does not render — the
   * stamp must be earned, not granted by chrome.
   *
   * Optional because the prop isn't on the auth session today; wire
   * from RootLayout once the data is server-resolvable.
   */
  viewerInGoodStanding?: boolean;
}

/** Build label — env-var sourced so a deploy can't lie about its version.
 * Bracket notation required because process.env is typed via index
 * signature (tsconfig has noPropertyAccessFromIndexSignature). */
const BUILD_LABEL = process.env["NEXT_PUBLIC_BCC_BUILD_LABEL"] ?? "v1";

/**
 * Account zone for authed users. The destinations mirror what the
 * ViewerMenu popover in the header exposes — the footer is the
 * fallback when the popover isn't on-screen (scrolled off the top).
 */
function authedAccountLinks(handle: string): readonly NavLink[] {
  return [
    { label: "My Profile",   href: `/u/${handle}`,        match: null },
    { label: "Messages",     href: "/messages",           match: null },
    { label: "Panel Duty",   href: "/panel",              match: null },
    { label: "Notifications", href: "/me/notification-prefs", match: null },
    { label: "Settings",     href: "/settings/profile",   match: null },
  ];
}

/** Get-Started zone for anonymous viewers. */
const ANON_GET_STARTED: readonly NavLink[] = [
  { label: "Sign In",        href: "/login",  match: null },
  { label: "Join the Floor", href: "/signup", match: null },
];

export function SiteFooter({
  viewerHandle,
  viewerInGoodStanding = false,
}: SiteFooterProps) {
  const year = new Date().getUTCFullYear();
  const authed = viewerHandle !== null;

  return (
    <footer className="bcc-site-footer" aria-labelledby="bcc-footer-heading">
      <h2 id="bcc-footer-heading" className="sr-only">
        Footer
      </h2>

      {/* ZONE A — anon acquisition strip. Light touch; not a marketing
          banner. Signed-in users skip this entirely. */}
      {!authed && (
        <div className="bcc-footer-acquire" aria-label="Get started">
          <span className="bcc-footer-acquire-text">
            <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
              READY TO JOIN?
            </span>
            <span className="bcc-footer-acquire-line">
              Watch cards, post reviews, build trust on the floor.
            </span>
          </span>
          <span className="bcc-footer-acquire-actions">
            <Link href="/login" className="bcc-btn bcc-btn-ghost">
              Sign In
            </Link>
            <Link href="/signup" className="bcc-btn bcc-btn-primary">
              Join the Floor
            </Link>
          </span>
        </div>
      )}

      {/* ZONE B — three-column zoned index */}
      <div className="bcc-footer-grid" aria-label="Site index">
        <FooterColumn label="Platform" items={PRIMARY_NAV} />
        <FooterColumn label="Operations" items={SPECIALIST_NAV} />
        <FooterColumn
          label={authed ? "Account" : "Get Started"}
          items={authed && viewerHandle !== null
            ? authedAccountLinks(viewerHandle)
            : ANON_GET_STARTED}
        />
      </div>

      {/* ZONE C — system-status + copyright + build */}
      <div className="bcc-footer">
        <span className="bcc-footer-meta-cluster">
          <FooterStatusDot />
          <span>© {year} Blue Collar Crypto</span>
        </span>
        {/* ZONE D — contextual stamp. Only renders when earned. */}
        {authed && viewerInGoodStanding && (
          <span
            className="bcc-footer-stamp"
            aria-label="You are a member in good standing"
          >
            Member in Good Standing
          </span>
        )}
        <span>{BUILD_LABEL} · Built on the Floor</span>
      </div>

      {/* Legal row — empty until /legal routes ship. When they do,
          replace this comment block with:
          <div className="bcc-footer-legal">
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/cookies">Cookies</Link>
            <Link href="/status">Status</Link>
            <a href="https://github.com/...">GitHub</a>
          </div>
          Don't ship 404-bait. */}
    </footer>
  );
}

/**
 * FooterColumn — one zone in the 3-column index. Mono caps label +
 * stencil link rows. Wraps on narrow viewports per the parent grid's
 * auto-fit rule (see globals.css `.bcc-footer-grid`).
 */
function FooterColumn({
  label,
  items,
}: {
  label: string;
  items: readonly NavLink[];
}) {
  return (
    <div className="bcc-footer-col">
      <div className="bcc-footer-col-label">{label}</div>
      <ul className="bcc-footer-col-list">
        {items.map((link) => (
          <li key={link.href}>
            <Link href={link.href as Route} className="bcc-footer-col-link">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * FooterStatusDot — placeholder operational indicator.
 *
 * Today: static "Operational" with a quiet verified-green dot. No
 * data fetch (no useSystemHealth hook exists yet in bcc-frontend).
 *
 * Future wiring: swap this implementation for a small client island
 * that consumes useSystemHealth and surfaces:
 *   - status === "ok"        → green dot, "All systems operational"
 *   - status === "degraded"  → weld-yellow dot, "Some surfaces degraded"
 *   - status === "incident"  → safety-orange dot, "Major incident — see status page"
 *
 * The /status route deep-link below activates whenever it ships.
 */
function FooterStatusDot() {
  return (
    <span
      className="bcc-footer-status"
      aria-label="Platform status: operational"
    >
      <span aria-hidden className="bcc-footer-status-dot" />
      <span>Operational</span>
    </span>
  );
}
