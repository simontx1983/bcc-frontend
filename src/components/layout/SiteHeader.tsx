"use client";

/**
 * SiteHeader — sticky top rail + main nav, slotted globally by RootLayout.
 *
 * Why a client component:
 *   - usePathname() drives the active nav underline + the rail's
 *     "BCC // <ROUTE>" readout
 *   - The UTC clock ticks every second; needs useEffect
 *   - The mobile menu sheet manages local open/close state
 *
 * Why rail + nav are paired here (not split):
 *   Both are global chrome with no per-route data. Pages that need
 *   route-specific status render their own kicker BELOW this header
 *   (e.g. the LivingHeader on a member profile).
 *
 * Server boundary:
 *   The viewer's handle is read in the server-side RootLayout via
 *   getServerSession() and passed in as a prop. This component RENDERS
 *   it; it does not fetch.
 *
 * Responsive layout:
 *   At <sm (mobile) the rail + inline nav-links + nav-actions cluster
 *   are hidden. The hamburger button replaces them; clicking opens a
 *   slide-down sheet that renders the same nav links + auth controls
 *   vertically. At sm+ the hamburger hides and the original three-cell
 *   grid layout (brand | nav-links | nav-actions) takes over.
 */

import type { Route } from "next";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MessagesBadge } from "@/components/messages/MessagesBadge";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearch } from "@/components/search/GlobalSearch";

import { SITE_NAV, isNavLinkActive, railLabelForPath } from "./nav-config";

interface SiteHeaderProps {
  /** Logged-in user's BCC handle, or null when anonymous. */
  viewerHandle: string | null;
  /** Network label for the rail-right strip. Server-pre-rendered. */
  networkLabel?: string;
}

export function SiteHeader({ viewerHandle, networkLabel = "Mainnet" }: SiteHeaderProps) {
  const pathname = usePathname() ?? "/";
  const railLabel = railLabelForPath(pathname).toUpperCase();

  // Mobile menu state — controls the slide-down sheet rendered below
  // the nav at <sm. Toggled by the hamburger button. Closes on route
  // change + Escape.
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close on route change so navigating from the sheet drops it.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on Escape — pairs with the dialog `aria-modal` semantics
  // without trapping focus (the sheet is a small linear list; native
  // tab order is sufficient).
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <header className="bcc-site-header">
      {/* Rail — hidden on mobile entirely. The labels (BCC // <ROUTE>,
          NET, OPERATOR, UTC clock) are decorative and would wrap to
          2–3 rows at 320px. Wrapper carries `hidden sm:block` because
          globals.css's `.bcc-rail { display: flex }` is declared inside
          `@layer components` — wrapping with a plain div sidesteps any
          cascade-tie risk against Tailwind utilities. */}
      <div className="hidden sm:block">
        <div className="bcc-rail">
          <span>
            <span className="bcc-rail-dot" aria-hidden />
            BCC // {railLabel}
          </span>
          <span className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1">
            <span>NET · {networkLabel.toUpperCase()}</span>
            <span>OPERATOR · {viewerHandle !== null ? `@${viewerHandle}` : "ANON"}</span>
            <UtcClock />
          </span>
        </div>
      </div>

      {/* `relative` makes bcc-nav the containing block for the
          absolutely-positioned mobile hamburger below. Avoids
          fighting bcc-nav's own grid-template-columns @media rules
          (single-column at ≤900px, 3-col at >900px); the hamburger
          floats on top of the brand row at <sm and is plain
          `display:none` at sm+ — natural bcc-nav layout takes over
          on tablet/desktop. */}
      <nav className="bcc-nav relative" aria-label="Primary">
        <Link href="/" className="bcc-brand" aria-label="Blue Collar Crypto — home">
          BLUE<span className="bcc-brand-accent">·</span>COLLAR
          <br />
          CRYPTO
          <span className="bcc-brand-sub">Signed on-chain · Graded by the floor</span>
        </Link>

        {/* Desktop nav-links + nav-actions. Hidden at <sm via a wrapping
            div (display: contents at sm+ so the inner blocks remain
            direct grid children of bcc-nav and the original layout
            survives). The mobile sheet below renders the same items
            vertically. */}
        <div className="hidden sm:contents">
          <div className="bcc-nav-links">
            {SITE_NAV.map((link) => {
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
          </div>

          <div className="bcc-nav-actions">
            {/* §G1 global autocomplete — visible at md+; hidden on
                tablet so the action cluster stays compact. The mobile
                sheet links to the discovery surfaces instead of
                duplicating the search input. */}
            <div className="hidden md:contents">
              <GlobalSearch />
            </div>

            {/* §4.19 direct-message badge — sibling of NotificationBell.
                Self-gates on `enabled`; anon viewers render null. Polls
                the unread-count endpoint adaptively (5s active → 30s
                idle, mirroring PeepSo's peepsomessages.js). */}
            <MessagesBadge enabled={viewerHandle !== null} />

            {/* §I1 notifications — self-gates on `enabled`; renders
                null for anon viewers. */}
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
            bcc-nav's grid layout. The brand text ends well before the
            right edge, so the hamburger never overlaps content. */}
        <div className="absolute right-5 top-3 sm:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="bcc-mobile-menu"
            aria-label={mobileOpen ? "Close site menu" : "Open site menu"}
            className="inline-flex h-11 w-11 items-center justify-center border-2 border-cardstock/40 text-cardstock transition hover:border-cardstock"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
            >
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

      {/* Mobile sheet — renders below the nav when the hamburger is
          open. Wrapped in `sm:hidden` so it's always invisible to
          tablet/desktop layouts. */}
      {mobileOpen && (
        <MobileMenuSheet
          viewerHandle={viewerHandle}
          pathname={pathname}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MobileMenuSheet — vertical menu rendered below the nav at <sm when
// the hamburger is open. Carries the same nav links + auth controls
// the desktop nav-actions cluster shows. Each row is a 48px touch
// target with a 16px horizontal hit area on each side.
// ─────────────────────────────────────────────────────────────────────

function MobileMenuSheet({
  viewerHandle,
  pathname,
  onClose,
}: {
  viewerHandle: string | null;
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div
      id="bcc-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
      className="border-t border-cardstock-edge/30 bg-concrete sm:hidden"
    >
      <ul className="flex flex-col py-1">
        {SITE_NAV.map((link) => {
          const active = isNavLinkActive(link, pathname);
          return (
            <li key={link.href}>
              <Link
                href={link.href as Route}
                aria-current={active ? "page" : undefined}
                onClick={onClose}
                className="bcc-stencil flex min-h-[48px] items-center px-6 text-[14px] tracking-[0.18em] text-cardstock"
                style={{
                  borderLeft: active
                    ? "3px solid var(--safety)"
                    : "3px solid transparent",
                }}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Authed-only icon row — messaging + notifications. Anonymous
          viewers see only the Sign In / Join CTAs below. */}
      {viewerHandle !== null && (
        <div className="border-t border-cardstock-edge/30 px-6 py-3">
          <div className="flex items-center gap-3">
            <MessagesBadge enabled={true} />
            <NotificationBell enabled={true} />
          </div>
        </div>
      )}

      {/* Auth cluster — same destinations the ViewerMenu popover uses
          on desktop, but rendered inline so the user doesn't need to
          tap into yet another popover from inside a popover. */}
      {viewerHandle !== null ? (
        <ul className="flex flex-col border-t border-cardstock-edge/30 py-1">
          <li>
            <Link
              href={`/u/${viewerHandle}` as Route}
              onClick={onClose}
              className="bcc-mono flex min-h-[48px] items-center px-6 text-[12px] tracking-[0.18em] text-cardstock-deep"
            >
              @{viewerHandle} — PROFILE
            </Link>
          </li>
          <li>
            <Link
              href={"/panel" as Route}
              onClick={onClose}
              className="bcc-mono flex min-h-[48px] items-center px-6 text-[12px] tracking-[0.18em] text-cardstock-deep"
            >
              PANEL DUTY
            </Link>
          </li>
          <li>
            <Link
              href={"/settings/profile" as Route}
              onClick={onClose}
              className="bcc-mono flex min-h-[48px] items-center px-6 text-[12px] tracking-[0.18em] text-cardstock-deep"
            >
              SETTINGS
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                onClose();
                // callbackUrl: "/" so the header re-renders anon-shaped
                // immediately. NextAuth handles the cookie clear + nav.
                void signOut({ callbackUrl: "/" });
              }}
              className="bcc-mono flex min-h-[48px] w-full items-center px-6 text-left text-[12px] tracking-[0.18em] text-safety"
            >
              SIGN OUT
            </button>
          </li>
        </ul>
      ) : (
        <ul className="flex flex-col border-t border-cardstock-edge/30 py-1">
          <li>
            <Link
              href="/login"
              onClick={onClose}
              className="bcc-stencil flex min-h-[48px] items-center px-6 text-[14px] tracking-[0.18em] text-cardstock"
            >
              Sign In
            </Link>
          </li>
          <li>
            <Link
              href="/signup"
              onClick={onClose}
              className="bcc-stencil flex min-h-[48px] items-center bg-safety px-6 text-[14px] tracking-[0.18em] text-ink"
            >
              Join the Floor
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * ViewerMenu — small dropdown for the logged-in viewer (desktop only).
 *
 * The header has three viewer-specific actions: jump to your own
 * profile, open settings, sign out. A flat row would crowd the
 * actions slot on narrow viewports; a button + popover keeps the
 * primary nav uncluttered while exposing the operations users actually
 * need (especially "Sign out", which was missing entirely before).
 *
 * On mobile, MobileMenuSheet renders the same destinations inline —
 * this popover is desktop-only.
 *
 * UX behaviour:
 *   - Toggle on click. Closes on outside click, Escape, route change,
 *     or any item activation.
 *   - Sign-out clears the NextAuth session and redirects to "/" so the
 *     header re-renders in its anonymous shape on first paint.
 *
 * Accessibility:
 *   - aria-haspopup + aria-expanded on the trigger.
 *   - The popover is a list of buttons / links keyboard-reachable in
 *     reading order. No focus trap (the popover is small + outside-
 *     click + Escape close cover the same job).
 */
function ViewerMenu({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // Close on outside click + Escape — single effect, scoped to open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current === null) return;
      if (!(event.target instanceof Node)) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Close on navigation — pathname change implies the user clicked
  // through to a new surface and the popover should drop.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const profileHref = `/u/${handle}` as Route;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="bcc-btn bcc-btn-ghost"
      >
        @{handle} <span aria-hidden>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="bcc-panel absolute right-0 top-full z-20 mt-1 flex min-w-[180px] flex-col gap-px"
          style={{ background: "rgba(15,13,9,0.06)" }}
        >
          <Link
            href={profileHref}
            role="menuitem"
            className="bcc-mono bg-cardstock px-4 py-2.5 text-[11px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            PROFILE
          </Link>
          <Link
            href={"/panel" as Route}
            role="menuitem"
            className="bcc-mono bg-cardstock px-4 py-2.5 text-[11px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            PANEL DUTY
          </Link>
          <Link
            href={"/settings/identity" as Route}
            role="menuitem"
            className="bcc-mono bg-cardstock px-4 py-2.5 text-[11px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            SETTINGS
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              // callbackUrl: "/" so the header re-renders anon-shaped
              // immediately. NextAuth handles the cookie clear + nav.
              void signOut({ callbackUrl: "/" });
            }}
            className="bcc-mono bg-cardstock px-4 py-2.5 text-left text-[11px] tracking-[0.16em] text-safety hover:bg-cardstock-deep"
          >
            SIGN OUT
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * UtcClock — live UTC ticker in the rail-right.
 *
 * Renders the placeholder "--:--:-- UTC" on first paint so server-rendered
 * HTML matches the initial client render (no hydration mismatch from the
 * server's wall-clock leaking into HTML). Updates once per second after
 * mount; cleans up on unmount.
 */
function UtcClock() {
  const [time, setTime] = useState<string>("--:--:-- UTC");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      setTime(
        `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span aria-label="Coordinated Universal Time" suppressHydrationWarning>
      {time}
    </span>
  );
}
