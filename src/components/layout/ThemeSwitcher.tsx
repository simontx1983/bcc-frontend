"use client";

/**
 * ThemeSwitcher — standalone palette-icon + Day/Night + accent modal.
 *
 * Extracted for reuse outside SiteHeader (the marketing/(marketing) header
 * needs the same widget). SiteHeader keeps its own inline copy rather than
 * importing this one — its palette button participates in that header's
 * "only one modal open at a time" mutual-exclusion with Messages/
 * Notifications/Avatar, and refactoring that shared close-all state wasn't
 * worth the regression risk on an already-complex, load-bearing component
 * just to dedupe a ~60-line modal used in exactly one other place.
 */

import { Moon, Palette, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { applyTheme, getStoredAccent, getStoredTheme, type Accent, type Theme } from "@/lib/theme";

const PaletteIcon = () => <Palette size={18} strokeWidth={1.5} aria-hidden />;

export function ThemeSwitcher({ className }: { className?: string }) {
  const paletteRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [accent, setAccent] = useState<Accent>("primary");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = getStoredTheme();
    const a = getStoredAccent();
    setTheme(t);
    setAccent(a);
    applyTheme(t, a);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(e: MouseEvent) {
      if (
        modalRef.current && !modalRef.current.contains(e.target as Node) &&
        paletteRef.current && !paletteRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={paletteRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={"bcc-btn-icon bcc-header-palette-btn" + (open ? " active" : "") + (className !== undefined ? " " + className : "")}
        aria-label="Theme settings"
        title="Theme & accent"
        style={open ? { color: "var(--bcc-accent)", background: "var(--bcc-accent-subtle)" } : undefined}
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
            // Entrance fade comes from the shared `.bcc-header-modal`
            // class (motion-safe, globals.css) — an inline `animation`
            // here would override it AND run under reduced motion.
          }}
        >
          <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 10 }}>
            Mode
          </p>

          <div style={{ display: "flex", background: "var(--bcc-bg-elevated)", borderRadius: "var(--bcc-radius-full)", padding: 3, marginBottom: 16, border: "1px solid var(--bcc-border)" }}>
            {(["light", "dark"] as Theme[]).map(t => (
              <button key={t} onClick={() => { setTheme(t); applyTheme(t, accent); }} style={{
                flex: 1, padding: "6px 0", borderRadius: "var(--bcc-radius-full)", border: "none", cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 11,
                letterSpacing: "0.1em", textTransform: "uppercase",
                transition: "background 150ms ease, color 150ms ease",
                background: theme === t ? "var(--bcc-accent)" : "transparent",
                color: theme === t ? "var(--bcc-white)" : "var(--bcc-text-secondary)",
              }}>
                {t === "light" ? <Sun size={13} strokeWidth={2} aria-hidden /> : <Moon size={13} strokeWidth={2} aria-hidden />}
                {t === "light" ? "Day" : "Night"}
              </button>
            ))}
          </div>

          <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 10 }}>
            Accent
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            {[
              { value: "primary"   as Accent, color: "var(--bcc-primary)", label: "Blue"   },
              { value: "secondary" as Accent, color: "var(--bcc-secondary)", label: "Orange" },
            ].map(({ value, color, label }) => (
              <button key={value} onClick={() => { setAccent(value); applyTheme(theme, value); }}
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
