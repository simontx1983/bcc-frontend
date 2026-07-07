"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";

import { LEGAL_ROUTES } from "@/lib/legal/config";

interface MainOffcanvasProps {
  open: boolean;
  onClose: () => void;
}

type Theme = "light" | "dark";
type Accent = "primary" | "secondary";

function applyTheme(theme: Theme, accent: Accent) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  html.setAttribute("data-accent", accent);
  localStorage.setItem("bcc-theme", theme);
  localStorage.setItem("bcc-accent", accent);
}

const PRIMARY_NAV = [
  { label: "Home",        href: "/" },
  { label: "Members",     href: "/members" },
  { label: "Directory",   href: "/directory" },
  { label: "Communities", href: "/communities" },
  { label: "Messages",    href: "/messages" },
  { label: "Disputes",    href: "/disputes" },
  { label: "Watching",    href: "/watching" },
  { label: "Validators",  href: "/validators" },
] as const;

const QUICK_LINKS = [
  { label: "My Progression", href: "/me/progression" },
  { label: "My Reliability",  href: "/me/reliability" },
  { label: "Panel Duty",      href: "/panel" },
  { label: "Settings",        href: "/settings/profile" },
] as const;

export function MainOffcanvas({ open, onClose }: MainOffcanvasProps) {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  const handle = session?.user?.handle ?? null;

  const [themeOpen, setThemeOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>("dark");
  const [currentAccent, setCurrentAccent] = useState<Accent>("primary");
  const cardRef = useRef<HTMLDivElement>(null);

  // Initialise theme/accent from DOM on mount
  useEffect(() => {
    const t = (document.documentElement.getAttribute("data-theme") ?? "dark") as Theme;
    const a = (document.documentElement.getAttribute("data-accent") ?? "primary") as Accent;
    setCurrentTheme(t);
    setCurrentAccent(a);
  }, []);

  useEffect(() => {
    if (!themeOpen) return;
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  function handleThemeChange(t: Theme) {
    setCurrentTheme(t);
    applyTheme(t, currentAccent);
  }

  function handleAccentChange(a: Accent) {
    setCurrentAccent(a);
    applyTheme(currentTheme, a);
  }


  // The panel stays in the DOM at all times. Visibility is controlled via
  // the .bcc-offcanvas--open modifier class and pointer-events.
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Scrim — hidden via display when closed */}
      <div
        className="bcc-offcanvas-scrim"
        onClick={onClose}
        aria-hidden
        style={{ display: open ? "block" : "none" }}
      />

      {/* Panel — translated off-screen when closed, slides in when open */}
      <div
        className={`bcc-offcanvas${open ? " bcc-offcanvas--open" : ""}`}
        role="dialog"
        aria-label="Main menu"
        aria-modal="true"
        aria-hidden={!open}
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        {/* Identity card */}
        <div className="bcc-offcanvas-identity-card" ref={cardRef}>
          <div className="bcc-offcanvas-identity-main">

            {/* Avatar */}
            <span
              className="bcc-avatar bcc-avatar-md bcc-stencil"
              style={{
                border: "2px solid var(--bcc-accent)",
                boxShadow: "0 0 0 3px var(--bcc-accent-subtle)",
                flexShrink: 0,
              }}
            >
              {handle ? handle.slice(0, 2).toUpperCase() : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6"/>
                  <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              )}
            </span>

            {/* Name + handle + badge */}
            <div className="bcc-offcanvas-identity-info">
              <div className="bcc-offcanvas-identity-name" style={{ maxWidth: "14ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {handle
                  ? (session?.user?.name ?? "Display Name")
                  : "Join the Floor"}
              </div>
              <div className="bcc-offcanvas-identity-handle" style={{ maxWidth: "16ch", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {handle ? `@${handle}` : "@pickahandle"}
              </div>
            </div>

            {/* Palette button */}
            <button
              className={`bcc-offcanvas-palette-btn${themeOpen ? " active" : ""}`}
              onClick={() => setThemeOpen(v => !v)}
              aria-label="Theme settings"
              aria-expanded={themeOpen}
            >
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M9 2a7 7 0 100 14c1.1 0 2-.9 2-2v-.5c0-.28.22-.5.5-.5H13a3 3 0 003-3A7 7 0 009 2z"
                  stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="6"  cy="8"   r="1" fill="currentColor"/>
                <circle cx="9"  cy="5.5" r="1" fill="currentColor"/>
                <circle cx="12" cy="8"   r="1" fill="currentColor"/>
              </svg>
            </button>
          </div>

          {/* Divider — 75% centered */}
          <div style={{ width: "75%", height: 1, background: "var(--bcc-border)", margin: "0 auto" }} />

          {/* Guest auth actions — sign-up/in prompt for anonymous viewers.
              Authed viewers see no stats strip here: the viewer's
              follower/following counts + rank live on the §3.1 user
              view-model (GET /users/:handle), which the shell does not
              otherwise fetch. Surfacing them would mean a new query on
              every menu open; rather than ship fabricated numbers we
              omit the strip until that data is cheaply available. */}
          {!handle && (
            <div style={{ padding: "10px 12px", display: "flex", gap: 8 }}>
              <Link href="/signup" className="bcc-btn bcc-btn-primary bcc-btn-sm" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>
                Sign Up
              </Link>
              <Link href="/login" className="bcc-btn bcc-btn-ghost bcc-btn-sm" onClick={onClose} style={{ flex: 1, justifyContent: "center" }}>
                Sign In
              </Link>
            </div>
          )}

          {/* Theme drawer — accordion (both authed + guest) */}
          <div className={`bcc-offcanvas-theme-drawer${themeOpen ? " bcc-offcanvas-theme-drawer--open" : ""}`}>
            <div className="bcc-offcanvas-theme-inner">
              {/* Day / Night pill */}
              <div style={{
                display: "flex",
                background: "var(--bcc-bg-elevated)",
                borderRadius: "var(--bcc-radius-full)",
                padding: 3,
                border: "1px solid var(--bcc-border)",
              }}>
                {(["light", "dark"] as Theme[]).map(t => (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: "var(--bcc-radius-full)",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-stencil), Impact, sans-serif",
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      transition: "background 150ms ease, color 150ms ease",
                      background: currentTheme === t ? "var(--bcc-accent)" : "transparent",
                      color: currentTheme === t ? "#fff" : "var(--bcc-text-secondary)",
                    }}
                  >
                    {t === "light" ? "☀ Day" : "☾ Night"}
                  </button>
                ))}
              </div>
              {/* Accent — card style */}
              <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bcc-text)", margin: "4px 0 6px" }}>
                Accent
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { value: "primary"   as Accent, color: "#16b5e6", label: "Blue"   },
                  { value: "secondary" as Accent, color: "#f98a1c", label: "Orange" },
                ]).map(({ value, color, label }) => (
                  <button
                    key={value}
                    onClick={() => handleAccentChange(value)}
                    className={`bcc-theme-option${currentAccent === value ? " selected" : ""}`}
                    style={{ flex: 1, flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px" }}
                    aria-pressed={currentAccent === value}
                  >
                    <span className="bcc-accent-swatch" style={{ background: color }} />
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: currentAccent === value ? "var(--bcc-accent)" : "var(--bcc-text-muted)" }}>
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>

          {/* Primary nav */}
          <nav aria-label="Primary navigation">
            {PRIMARY_NAV.map(item => (
              <Link
                key={item.href}
                href={item.href as Route}
                onClick={onClose}
                className={`bcc-nav-item${isActive(item.href) ? " active" : ""}`}
                aria-current={isActive(item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Quick links — authed only */}
          {handle && (
            <>
              <div className="bcc-nav-divider" />
              <p className="bcc-nav-section">Quick links</p>
              <nav aria-label="Quick links">
                {QUICK_LINKS.map(item => (
                  <Link
                    key={item.href}
                    href={item.href as Route}
                    onClick={onClose}
                    className={`bcc-nav-item${isActive(item.href) ? " active" : ""}`}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    style={{ fontSize: 12 }}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </>
          )}

          {/* Legal links */}
          <div className="bcc-nav-divider" />
          <div style={{ padding: "8px 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { label: "Privacy", href: LEGAL_ROUTES.privacy },
              { label: "Terms",   href: LEGAL_ROUTES.terms },
              { label: "Cookies", href: LEGAL_ROUTES.cookies },
            ].map(item => (
              <Link
                key={item.href}
                href={item.href as Route}
                onClick={onClose}
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 11,
                  color: "var(--bcc-text-muted)",
                  letterSpacing: "0.06em",
                }}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sign out — authed only */}
          {handle && (
            <>
              <div className="bcc-nav-divider" />
              <button
                onClick={() => { onClose(); signOut({ callbackUrl: "/login" }); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 24px",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--bcc-danger)",
                  fontFamily: "var(--font-serif), Georgia, serif",
                  fontSize: 13,
                }}
              >
                Sign Out
              </button>
            </>
          )}

        </div>
      </div>
    </>
  );
}