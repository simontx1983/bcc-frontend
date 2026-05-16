"use client";

/**
 * HeaderNav — the primary nav row + brand + action cluster.
 *
 * Redesigned 2026-05-11. Key moves:
 *
 *   - Brand collapses to a single stencil line + safety bracket; the
 *     three-line stack ("BLUE·COLLAR / CRYPTO / sub-tagline") was
 *     eating ~30% of the row's horizontal real estate on a 1280px
 *     viewport. Sub-tagline still ships as `aria-label` so screen
 *     readers + crawlers see the brand promise.
 *
 *   - Two-tier nav: PRIMARY four (Floor / Directory / Communities /
 *     Watching) render inline at all sm+ sizes; SPECIALIST three
 *     (Validators / Disputes / Members) collapse behind an OPS pop-row.
 *     Messages stays exclusively in the right-side action cluster
 *     (the MessagesBadge already deep-links there — the nav-link was
 *     a duplicate).
 *
 *   - Active state uses a SOLID safety-orange block under the link
 *     (4px), not a thin border. Focus state uses a dotted outline so
 *     keyboard nav doesn't confuse "active" with "focused" — they
 *     used to both render as a 3px solid safety underline (R5).
 *
 *   - GlobalSearch surfaces from sm: up (was md:+). Tablet was a dead
 *     zone for global discovery; this restores parity.
 *
 *   - `⌘K` / `/` global hotkey focuses GlobalSearch when no input is
 *     focused and no modal is open. Surfaces a hint on the trigger so
 *     power users discover it without docs.
 */

import type { Route } from "next";
import Link from "next/link";

import { GlobalSearch } from "@/components/search/GlobalSearch";
import { MessagesBadge } from "@/components/messages/MessagesBadge";
import { NotificationBell } from "@/components/notifications/NotificationBell";

import { ViewerMenu } from "./ViewerMenu";
import { OpsMenu } from "./OpsMenu";
import {
  PRIMARY_NAV,
  SPECIALIST_NAV,
  isNavLinkActive,
} from "./nav-config";

interface HeaderNavProps {
  pathname: string;
  viewerHandle: string | null;
  mobileOpen: boolean;
  onMobileToggle: () => void;
}

export function HeaderNav({
  pathname,
  viewerHandle,
  mobileOpen,
  onMobileToggle,
}: HeaderNavProps) {
  return (
    // `relative` lets the mobile hamburger float absolutely without
    // fighting the bcc-nav grid template at <sm.
    <nav className="bcc-nav relative" aria-label="Primary">
      <Link
        href="/"
        className="bcc-brand"
        aria-label="Blue Collar Crypto — signed on-chain, graded by the floor"
      >
        <span className="bcc-brand-line">
          BLUE<span className="bcc-brand-accent">·</span>COLLAR
          <span className="bcc-brand-bracket" aria-hidden>
            CRYPTO
          </span>
        </span>
      </Link>

      {/* Desktop nav-links + nav-actions. Hidden at <sm via a wrapping
          div (display: contents at sm+ so the inner blocks remain
          direct grid children of bcc-nav and the original layout
          survives). The mobile sheet renders the same content. */}
      <div className="hidden sm:contents">
        <div className="bcc-nav-links">
          {PRIMARY_NAV.map((link) => {
            const active = isNavLinkActive(link, pathname);
            return (
              <Link
                key={link.href}
                href={link.href as Route}
                className="bcc-nav-link"
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
          <OpsMenu items={SPECIALIST_NAV} pathname={pathname} />
        </div>

        <div className="bcc-nav-actions">
          {/* §G1 global autocomplete — now visible from sm: up (was
              md:+). Tablets gain a real discovery surface. */}
          <GlobalSearch />

          {/* §4.19 direct-message badge. Self-gates on `enabled`;
              anon viewers render null. */}
          <MessagesBadge enabled={viewerHandle !== null} />

          {/* §I1 notifications. Self-gates on `enabled`; anon
              viewers render null. */}
          <NotificationBell enabled={viewerHandle !== null} />

          {viewerHandle !== null ? (
            <ViewerMenu handle={viewerHandle} />
          ) : (
            <>
              <Link href="/login" className="bcc-btn bcc-btn-ghost">
                Sign In
              </Link>
              <Link href="/signup" className="bcc-btn bcc-btn-primary">
                Join the Floor
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile hamburger — absolutely positioned at top-right of
          bcc-nav so it floats over the brand row without fighting
          bcc-nav's grid layout at <sm. */}
      <div className="absolute right-5 top-3 sm:hidden">
        <button
          type="button"
          onClick={onMobileToggle}
          aria-expanded={mobileOpen}
          aria-controls="bcc-mobile-menu"
          aria-label={mobileOpen ? "Close site menu" : "Open site menu"}
          className="inline-flex h-11 w-11 items-center justify-center border-2 border-cardstock/40 text-cardstock transition hover:border-cardstock"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            {mobileOpen ? (
              <>
                <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="2" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="2" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" strokeWidth="2" />
                <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="2" />
                <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" strokeWidth="2" />
              </>
            )}
          </svg>
        </button>
      </div>
    </nav>
  );
}
