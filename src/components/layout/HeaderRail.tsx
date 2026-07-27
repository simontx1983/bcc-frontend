"use client";

/**
 * HeaderRail — the dashed-bottom telemetry strip atop the nav.
 *
 * Three zones:
 *
 *   [LEFT]   pulsing dot · "BCC // <ROUTE>" (workshop tone — the
 *            page identifier, not nav)
 *   [MID]    NET · <network>           (mempool / chain context)
 *   [RIGHT]  ShiftBadge + UTC clock    (operator state + sync token)
 *
 * Behaviour redesign (2026-05-11):
 *
 *   - Dropped the duplicated `OPERATOR · @handle` — the avatar menu
 *     below already carries the identity. Replaced with a SHIFT
 *     status badge that pulses safety-orange when the viewer has a
 *     live obligation (on_duty), goes flat-cardstock when quiet,
 *     and dims to "OFF-SHIFT" when anonymous.
 *   - Hidden on mobile (<sm) entirely — the labels would wrap 2-3
 *     rows at 320px and the shift badge surfaces in the mobile sheet
 *     where it has room to breathe.
 */

import { useEffect, useState } from "react";

import { railLabelForPath } from "./nav-config";
import type { ShiftStatus } from "./SiteHeader";

interface HeaderRailProps {
  pathname: string;
  networkLabel: string;
  shiftStatus: ShiftStatus;
}

export function HeaderRail({
  pathname,
  networkLabel,
  shiftStatus,
}: HeaderRailProps) {
  const railLabel = railLabelForPath(pathname).toUpperCase();

  return (
    // Wrapper carries `hidden sm:block` because globals.css's
    // `.bcc-rail { display: flex }` is declared inside `@layer
    // components` — wrapping with a plain div sidesteps any
    // cascade-tie risk against Tailwind utilities.
    <div className="hidden sm:block">
      {/* Scoped theme-aware text override: the shared `.bcc-rail` class
          (globals.css) hard-codes a fixed cream color that vanishes on the
          light-theme header. Overriding here — NOT in the class — keeps the
          fix local to the header rail and leaves WatchingGrid's `.bcc-rail`
          untouched (out of this slice). */}
      <div className="bcc-rail text-bcc-text-secondary">
        <span className="inline-flex items-center">
          <span className="bcc-rail-dot" aria-hidden />
          BCC // {railLabel}
        </span>

        <span className="hidden md:inline-flex items-center">
          <span aria-hidden className="mr-2 inline-block h-px w-6 bg-cardstock/15" />
          NET · {networkLabel.toUpperCase()}
        </span>

        <span className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
          <ShiftBadge status={shiftStatus} />
          <UtcClock />
        </span>
      </div>
    </div>
  );
}

/**
 * ShiftBadge — the right-side workshop chip that surfaces whether the
 * operator has a live obligation. Three visual states:
 *
 *   on_duty → safety-orange filled pill + pulse dot + "PANEL DUTY"
 *   quiet   → flat cardstock-edge pill + faint dot + "ON SHIFT"
 *   off     → ink-soft outline pill + no dot + "OFF-SHIFT"
 *
 * The chip is decorative + informational; it has no click handler in
 * this PR. The intended affordance (when prop wiring catches up) is
 * to deep-link to /panel for on_duty.
 */
function ShiftBadge({ status }: { status: ShiftStatus }) {
  const label =
    status === "on_duty" ? "PANEL DUTY"
    : status === "quiet" ? "ON SHIFT"
    : "OFF-SHIFT";

  // on_duty KEEPS its safety fill + border (status identity); only the fixed
  // cream FOREGROUND — invisible on the light-theme header — moves to the
  // theme-aware text token. The safety wash is 18% over the theme-aware
  // header, so `--bcc-text` (which always contrasts that header) is legible
  // in both themes; verified against the actual pale-in-light / dark-in-dark
  // background, not assumed. quiet/off migrate their cream border+text to the
  // semantic border/secondary/muted tokens.
  const surface =
    status === "on_duty"
      ? { background: "rgb(var(--safety-rgb) / 0.18)", border: "1px solid var(--safety)", color: "var(--bcc-text)" }
    : status === "quiet"
      ? { background: "transparent", border: "1px solid var(--bcc-border)", color: "var(--bcc-text-secondary)" }
      : { background: "transparent", border: "1px solid var(--bcc-border)", color: "var(--bcc-text-muted)" };

  return (
    <span
      aria-label={`Operator status: ${label}`}
      className="inline-flex items-center gap-2 rounded-[1px] px-2 py-0.5 text-[10px] tracking-[0.18em]"
      style={surface}
    >
      {status === "on_duty" && (
        <span aria-hidden className="bcc-rail-dot" style={{ margin: 0, width: 6, height: 6 }} />
      )}
      {status === "quiet" && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--bcc-text-muted)" }}
        />
      )}
      {label}
    </span>
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
