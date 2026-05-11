"use client";

/**
 * MobileMenuSheet — vertical menu rendered below the nav at <sm when
 * the hamburger is open.
 *
 * Redesigned 2026-05-11 — four visually-distinct zones replace the
 * flat 1-list-fits-all approach:
 *
 *   [ZONE 1]  Primary destinations (Floor / Directory / Communities / Binder)
 *   [ZONE 2]  Specialist destinations (Validators / Disputes / Members)
 *             — captioned "OPS" so the demotion is visible, not hidden
 *   [ZONE 3]  Shift status + bell + messages row (authed only) — the
 *             operator's "you are here" context
 *   [ZONE 4]  Identity actions (Profile / Settings / Sign Out) for
 *             authed, OR (Sign In / Join the Floor) for anon
 *
 * Each row is a 48px touch target with a 16px horizontal hit area.
 * Active-state uses a 3px safety-orange left border to match the
 * OpsMenu treatment on desktop.
 */

import type { Route } from "next";
import Link from "next/link";
import { signOut } from "next-auth/react";

import { MessagesBadge } from "@/components/messages/MessagesBadge";
import { NotificationBell } from "@/components/notifications/NotificationBell";

import type { ShiftStatus } from "./SiteHeader";
import {
  PRIMARY_NAV,
  SPECIALIST_NAV,
  isNavLinkActive,
  type NavLink,
} from "./nav-config";

interface MobileMenuSheetProps {
  viewerHandle: string | null;
  pathname: string;
  shiftStatus: ShiftStatus;
  onClose: () => void;
}

export function MobileMenuSheet({
  viewerHandle,
  pathname,
  shiftStatus,
  onClose,
}: MobileMenuSheetProps) {
  return (
    <div
      id="bcc-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Site navigation"
      className="border-t border-cardstock-edge/30 bg-concrete sm:hidden"
    >
      {/* ZONE 1 — primary destinations */}
      <NavZone
        caption="WHERE TO"
        items={PRIMARY_NAV}
        pathname={pathname}
        onClose={onClose}
      />

      {/* ZONE 2 — specialist destinations (demoted but visible) */}
      <NavZone
        caption="OPS"
        items={SPECIALIST_NAV}
        pathname={pathname}
        onClose={onClose}
        dim
      />

      {/* ZONE 3 — operator state + comms (authed only). Messages
          lives here so it's not duplicated as a nav-link. */}
      {viewerHandle !== null && (
        <div
          className="border-t border-cardstock-edge/30 px-6 py-3"
          aria-label="Operator status and live comms"
        >
          <div className="bcc-mono mb-2 text-[9px] tracking-[0.24em] text-cardstock/40">
            SHIFT
          </div>
          <div className="flex items-center justify-between gap-3">
            <ShiftRow status={shiftStatus} />
            <div className="flex items-center gap-3">
              <MessagesBadge enabled={true} />
              <NotificationBell enabled={true} />
            </div>
          </div>
        </div>
      )}

      {/* ZONE 4 — identity actions */}
      {viewerHandle !== null ? (
        <ul
          className="flex flex-col border-t border-cardstock-edge/30 py-1"
          aria-label="Operator actions"
        >
          <li>
            <Link
              href={`/u/${viewerHandle}` as Route}
              onClick={onClose}
              className="bcc-stencil flex min-h-[48px] items-center px-6 text-[13px] tracking-[0.18em] text-cardstock"
            >
              @{viewerHandle} — PROFILE
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
        <ul
          className="flex flex-col border-t border-cardstock-edge/30 py-1"
          aria-label="Sign in or join"
        >
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
 * NavZone — a captioned list of nav-links with a visible "what bucket"
 * header. `dim` lowers the link weight for specialist tier so the
 * primary tier reads as more important without hiding either.
 */
function NavZone({
  caption,
  items,
  pathname,
  onClose,
  dim = false,
}: {
  caption: string;
  items: readonly NavLink[];
  pathname: string;
  onClose: () => void;
  dim?: boolean;
}) {
  return (
    <div className="border-b border-cardstock-edge/20 py-1">
      <div className="bcc-mono px-6 pt-3 pb-1 text-[9px] tracking-[0.24em] text-cardstock/40">
        {caption}
      </div>
      <ul className="flex flex-col">
        {items.map((link) => {
          const active = isNavLinkActive(link, pathname);
          return (
            <li key={link.href}>
              <Link
                href={link.href as Route}
                aria-current={active ? "page" : undefined}
                onClick={onClose}
                className={
                  "bcc-stencil flex min-h-[48px] items-center px-6 tracking-[0.18em] " +
                  (dim
                    ? "text-[13px] text-cardstock/80"
                    : "text-[14px] text-cardstock")
                }
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
    </div>
  );
}

/**
 * ShiftRow — surfaces the operator's shift status in the mobile sheet.
 * Mirrors the desktop ShiftBadge but stays inline so it can pair with
 * the bell + messages cluster on the same row.
 */
function ShiftRow({ status }: { status: ShiftStatus }) {
  const label =
    status === "on_duty" ? "PANEL DUTY"
    : status === "quiet" ? "ON SHIFT"
    : "OFF-SHIFT";

  const surface =
    status === "on_duty"
      ? { background: "rgba(240,90,40,0.18)", border: "1px solid var(--safety)", color: "var(--cardstock)" }
    : status === "quiet"
      ? { background: "transparent", border: "1px solid rgba(239,229,207,0.22)", color: "rgba(239,229,207,0.85)" }
      : { background: "transparent", border: "1px solid rgba(239,229,207,0.10)", color: "rgba(239,229,207,0.4)" };

  return (
    <span
      aria-label={`Operator status: ${label}`}
      className="bcc-mono inline-flex items-center gap-2 rounded-[1px] px-2.5 py-1 text-[10px] tracking-[0.18em]"
      style={surface}
    >
      {status === "on_duty" && (
        <span aria-hidden className="bcc-rail-dot" style={{ margin: 0, width: 6, height: 6 }} />
      )}
      {label}
    </span>
  );
}
