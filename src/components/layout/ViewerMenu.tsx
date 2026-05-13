"use client";

/**
 * ViewerMenu — the authed-user identity disclosure on the right edge.
 *
 * Redesigned 2026-05-11 — trigger is now an "ID badge" not a ghost
 * button. The previous text-only `@handle ▾` made the operator look
 * like every other button in the action cluster. A monogram disc +
 * handle + safety-orange edge stripe gives the personal element the
 * visual weight it deserves.
 *
 * The disc shows the first character of the handle uppercased — a
 * deliberate fallback rather than a server-fetched avatar, because:
 *   1. The avatar URL isn't on the prop boundary today (SiteHeader
 *      receives `viewerHandle: string | null` only).
 *   2. A pure CSS monogram never produces a layout-shift on slow
 *      networks, never 404s, and never leaks a stale photo after
 *      avatar-change before cache invalidation lands.
 *   3. The workshop aesthetic prefers a stamped initial to a
 *      photo-realistic headshot — see the "stamp" + "seal" treatment
 *      throughout the design system.
 *
 * When an avatar URL becomes available on the prop boundary, the disc
 * can layer a background-image on top of the monogram — no shape
 * change needed.
 */

import type { Route } from "next";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface ViewerMenuProps {
  handle: string;
}

export function ViewerMenu({ handle }: ViewerMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // Close on outside click + Escape.
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

  // Close on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const profileHref = `/u/${handle}` as Route;
  const initial = handle.charAt(0).toUpperCase() || "?";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Operator menu — signed in as @${handle}`}
        className="group inline-flex items-center gap-2 border border-cardstock/30 px-1.5 py-1 text-cardstock transition hover:border-cardstock focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safety"
        style={{ borderLeft: "3px solid var(--safety)" }}
      >
        <span
          aria-hidden
          className="bcc-stencil inline-flex h-7 w-7 items-center justify-center bg-cardstock text-[14px] leading-none text-ink"
          style={{ letterSpacing: 0 }}
        >
          {initial}
        </span>
        <span className="bcc-mono hidden text-[11px] tracking-[0.14em] sm:inline">
          @{handle}
        </span>
        <span aria-hidden className="text-[10px] leading-none opacity-70">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="bcc-panel absolute right-0 top-full z-30 mt-1 flex min-w-[220px] flex-col gap-px overflow-hidden"
          style={{ background: "rgba(15,13,9,0.06)" }}
        >
          <div
            className="bcc-mono bg-cardstock px-4 py-2 text-[9px] tracking-[0.24em] text-cardstock-deep"
            style={{ borderBottom: "1px dashed rgba(15,13,9,0.18)" }}
            aria-hidden
          >
            OPERATOR · @{handle.toUpperCase()}
          </div>
          <Link
            href={profileHref}
            role="menuitem"
            className="bcc-stencil bg-cardstock px-4 py-3 text-[13px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            Profile
          </Link>
          <Link
            href={"/me/progression" as Route}
            role="menuitem"
            className="bcc-stencil bg-cardstock px-4 py-3 text-[13px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            Progression
          </Link>
          <Link
            href={"/panel" as Route}
            role="menuitem"
            className="bcc-stencil bg-cardstock px-4 py-3 text-[13px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            Panel Duty
          </Link>
          <Link
            href={"/settings/identity" as Route}
            role="menuitem"
            className="bcc-stencil bg-cardstock px-4 py-3 text-[13px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              // callbackUrl: "/" so the header re-renders anon-shaped
              // immediately. NextAuth handles the cookie clear + nav.
              void signOut({ callbackUrl: "/" });
            }}
            className="bcc-stencil bg-cardstock px-4 py-3 text-left text-[13px] tracking-[0.16em] text-safety hover:bg-cardstock-deep"
            style={{ borderTop: "1px dashed rgba(15,13,9,0.18)" }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
