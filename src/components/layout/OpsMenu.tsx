"use client";

/**
 * OpsMenu — disclosure popover for the SPECIALIST nav tier.
 *
 * Houses the three lower-frequency destinations (Validators / Disputes
 * / Members) so the PRIMARY four (Floor / Directory / Communities /
 * Watching) keep the inline strip uncluttered.
 *
 * Visual signal: the trigger renders as a normal nav-link with a small
 * caret. When the active route lives inside the specialist tier (e.g.
 * the user is on /disputes), the trigger shows the active-state block
 * underline so the user can find their location even when the actual
 * link is one click away.
 */

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { NavLink } from "./nav-config";
import { isNavLinkActive } from "./nav-config";

interface OpsMenuProps {
  items: readonly NavLink[];
  pathname: string;
}

export function OpsMenu({ items, pathname }: OpsMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Active when ANY specialist link matches the current route — keeps
  // the disclosure visually anchored to user location.
  const groupActive = items.some((link) => isNavLinkActive(link, pathname));

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

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={groupActive ? "page" : undefined}
        className="bcc-nav-link inline-flex items-center gap-1.5"
      >
        OPS
        <span aria-hidden className="text-[10px] leading-none opacity-70">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Specialist surfaces"
          className="bcc-panel absolute left-1/2 top-full z-30 mt-1 flex min-w-[220px] -translate-x-1/2 flex-col gap-px overflow-hidden"
          style={{ background: "rgba(15,13,9,0.06)" }}
        >
          {/* Caption strip — matches the workshop tone of the rail. */}
          <div
            className="bcc-mono bg-cardstock px-4 py-2 text-[9px] tracking-[0.24em] text-cardstock-deep"
            style={{ borderBottom: "1px dashed rgba(15,13,9,0.18)" }}
            aria-hidden
          >
            OPS · SPECIALIST SURFACES
          </div>
          {items.map((link) => {
            const active = isNavLinkActive(link, pathname);
            return (
              <Link
                key={link.href}
                href={link.href as Route}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className="bcc-stencil flex items-center justify-between bg-cardstock px-4 py-3 text-[13px] tracking-[0.16em] text-ink hover:bg-cardstock-deep"
                style={{
                  borderLeft: active
                    ? "3px solid var(--safety)"
                    : "3px solid transparent",
                }}
              >
                <span>{link.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="bcc-mono text-[9px] tracking-[0.2em] text-safety"
                  >
                    HERE
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
