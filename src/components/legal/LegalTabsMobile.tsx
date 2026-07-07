"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LEGAL_ROUTES } from "@/lib/legal/config";

const TABS = [
  { label: "Terms",   href: LEGAL_ROUTES.terms },
  { label: "Privacy", href: LEGAL_ROUTES.privacy },
  { label: "Cookies", href: LEGAL_ROUTES.cookies },
] as const;

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Mobile nav for the legal pages — collapses the Terms/Privacy/Cookies
 * tabs into a hamburger + small dropdown (LegalTabs handles the desktop
 * inline row). The dropdown stays mounted and animates opacity/scale
 * rather than conditionally rendering, so both open AND close get a
 * transition instead of just popping shut. */
export function LegalTabsMobile() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        modalRef.current && !modalRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`bcc-btn-icon${open ? " active" : ""}`}
        aria-label="Legal document links"
        aria-expanded={open}
        title="Terms, Privacy, Cookies"
      >
        <MenuIcon />
      </button>

      <div
        ref={modalRef}
        role="dialog"
        aria-label="Legal documents"
        aria-hidden={!open}
        className="bcc-header-modal"
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          minWidth: 160,
          borderRadius: "var(--bcc-radius-lg)",
          padding: "8px",
          zIndex: 300,
          transformOrigin: "top right",
          transition: "opacity 150ms ease, transform 150ms ease",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.95)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className="bcc-mono"
              style={{
                display: "block",
                padding: "8px 12px",
                borderRadius: "var(--bcc-radius-md)",
                fontSize: 12,
                letterSpacing: "0.08em",
                color: active ? "var(--bcc-accent)" : "var(--bcc-text-secondary)",
                background: active ? "var(--bcc-accent-subtle)" : "transparent",
              }}
            >
              {tab.label.toUpperCase()}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
