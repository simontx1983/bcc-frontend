"use client";

import { useEffect, useRef, useState } from "react";

import { applyTheme, getStoredAccent, getStoredTheme, type Accent, type Theme } from "@/lib/theme";

function PaletteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M9 2a7 7 0 100 14c1.1 0 2-.9 2-2v-.5c0-.28.22-.5.5-.5H13a3 3 0 003-3A7 7 0 009 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="6" cy="8" r="1" fill="currentColor"/>
      <circle cx="9" cy="5.5" r="1" fill="currentColor"/>
      <circle cx="12" cy="8" r="1" fill="currentColor"/>
    </svg>
  );
}

/** Self-contained theme/accent switcher for the legal-page header — same
 * day/night + accent control as SiteHeader's palette button, reimplemented
 * locally (that one is a private function inside SiteHeader.tsx) rather
 * than shared, matching how MainOffcanvas already keeps its own
 * independent copy of the same control. */
export function LegalThemeToggle() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [accent, setAccent] = useState<Accent>("primary");
  const btnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = getStoredTheme();
    const a = getStoredAccent();
    setTheme(t);
    setAccent(a);
    applyTheme(t, a);
  }, []);

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

  function handleThemeChange(t: Theme) {
    setTheme(t);
    applyTheme(t, accent);
  }
  function handleAccentChange(a: Accent) {
    setAccent(a);
    applyTheme(theme, a);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`bcc-btn-icon${open ? " active" : ""}`}
        aria-label="Theme settings"
        aria-expanded={open}
        title="Theme & accent"
      >
        <PaletteIcon />
      </button>

      {open && (
        <div
          ref={modalRef}
          role="dialog"
          aria-label="Theme settings"
          className="bcc-header-modal"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 240,
            borderRadius: "var(--bcc-radius-lg)",
            padding: "16px",
            zIndex: 300,
            animation: "bcc-fade-in 0.15s ease forwards",
          }}
        >
          <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 10 }}>
            Mode
          </p>
          <div style={{ display: "flex", background: "var(--bcc-bg-elevated)", borderRadius: "var(--bcc-radius-full)", padding: 3, marginBottom: 16, border: "1px solid var(--bcc-border)" }}>
            {(["light", "dark"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                style={{
                  flex: 1, padding: "6px 0", borderRadius: "var(--bcc-radius-full)", border: "none", cursor: "pointer",
                  fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 11,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  transition: "background 150ms ease, color 150ms ease",
                  background: theme === t ? "var(--bcc-accent)" : "transparent",
                  color: theme === t ? "var(--bcc-white)" : "var(--bcc-text-secondary)",
                }}
              >
                {t === "light" ? "☀ Day" : "☾ Night"}
              </button>
            ))}
          </div>

          <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 10 }}>
            Accent
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { value: "primary" as Accent, color: "var(--bcc-primary)", label: "Blue" },
              { value: "secondary" as Accent, color: "var(--bcc-secondary)", label: "Orange" },
            ]).map(({ value, color, label }) => (
              <button
                key={value}
                onClick={() => handleAccentChange(value)}
                className={`bcc-theme-option${accent === value ? " selected" : ""}`}
                style={{ flex: 1, flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px" }}
                aria-pressed={accent === value}
              >
                <span className="bcc-accent-swatch" style={{ background: color }} />
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: accent === value ? "var(--bcc-accent)" : "var(--bcc-text-muted)" }}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
