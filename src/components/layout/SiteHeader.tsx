"use client";

/**
 * SiteHeader — sticky top rail + main nav, slotted globally by RootLayout.
 *
 * Redesigned 2026-05-11 — see HeaderRail / HeaderNav / MobileMenuSheet.
 *
 * Why a client component:
 *   - usePathname() drives the active-state + the rail's contextual readout
 *   - The UTC clock ticks every second; needs useEffect
 *   - The mobile sheet + ViewerMenu manage local open/close state
 *   - The ⌘K / `/` hotkey listens at the window level
 *
 * Server boundary:
 *   The viewer's handle is read in the server-side RootLayout via
 *   getServerSession() and passed in as a prop. This component RENDERS
 *   it; it does not fetch. `shiftStatus` is optional — defaults to
 *   "quiet" until a service grows a "you are needed" signal.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { HeaderRail } from "./HeaderRail";
import { HeaderNav } from "./HeaderNav";
import { MobileMenuSheet } from "./MobileMenuSheet";

export type ShiftStatus = "on_duty" | "quiet" | "off";

interface SiteHeaderProps {
  /** Logged-in user's BCC handle, or null when anonymous. */
  viewerHandle: string | null;
  /** Network label for the rail-right strip. Server-pre-rendered. */
  networkLabel?: string;
  /**
   * Operator shift status, drives the rail-right badge.
   *
   *   - "on_duty" — viewer has a live obligation (panel selection,
   *                 dispute deadline within 24h, validator-quorum due).
   *                 Badge pulses safety-orange.
   *   - "quiet"   — viewer is signed in, nothing pressing. Badge is
   *                 a flat cardstock pill.
   *   - "off"     — anonymous viewer or signed-out. Badge reads
   *                 "OFF-SHIFT" and dims.
   *
   * Defaults to "quiet" when authed, "off" when anon. Caller can
   * override once the data is available server-side.
   */
  shiftStatus?: ShiftStatus;
}

export function SiteHeader({
  viewerHandle,
  networkLabel = "Mainnet",
  shiftStatus,
}: SiteHeaderProps) {
  const pathname = usePathname() ?? "/";

  // Resolve the effective shift status. Anon viewers are always
  // "off"; authed viewers default to "quiet" unless the caller
  // explicitly passed a higher state.
  const effectiveShift: ShiftStatus =
    viewerHandle === null
      ? "off"
      : (shiftStatus ?? "quiet");

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
      <HeaderRail
        pathname={pathname}
        networkLabel={networkLabel}
        shiftStatus={effectiveShift}
      />
      <HeaderNav
        pathname={pathname}
        viewerHandle={viewerHandle}
        onMobileToggle={() => setMobileOpen((prev) => !prev)}
        mobileOpen={mobileOpen}
      />
      {mobileOpen && (
        <MobileMenuSheet
          viewerHandle={viewerHandle}
          pathname={pathname}
          shiftStatus={effectiveShift}
          onClose={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}
