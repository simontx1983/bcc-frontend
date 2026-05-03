"use client";

/**
 * SiteHeader — sticky top rail + main nav, slotted globally by RootLayout.
 *
 * Why a client component:
 *   - usePathname() drives the active nav underline + the rail's
 *     "BCC // <ROUTE>" readout
 *   - The UTC clock ticks every second; needs useEffect
 *   - The mobile-collapsed strip uses scroll, not JS, so no extra state
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
 */

import type { Route } from "next";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

  return (
    <header className="bcc-site-header">
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

      <nav className="bcc-nav" aria-label="Primary">
        <Link href="/" className="bcc-brand" aria-label="Blue Collar Crypto — home">
          BLUE<span className="bcc-brand-accent">·</span>COLLAR
          <br />
          CRYPTO
          <span className="bcc-brand-sub">Signed on-chain · Graded by the floor</span>
        </Link>

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
          {/* §G1 global autocomplete — visible to anon + authed alike,
              left of the auth controls so it's the first chrome a new
              visitor reaches for. */}
          <GlobalSearch />

          {/* §I1 notifications — self-gates on `enabled`; renders null
              for anon viewers. Lives between search and the viewer
              menu so the bell sits at the right edge of the auth-only
              cluster. */}
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
      </nav>
    </header>
  );
}

/**
 * ViewerMenu — small dropdown for the logged-in viewer.
 *
 * The header has three viewer-specific actions: jump to your own
 * profile, open settings, sign out. A flat row would crowd the
 * actions slot on narrow viewports; a button + popover keeps the
 * primary nav uncluttered while exposing the operations users actually
 * need (especially "Sign out", which was missing entirely before).
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
