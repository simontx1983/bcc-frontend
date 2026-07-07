export type Theme = "light" | "dark";
export type Accent = "primary" | "secondary";

/**
 * Single source of truth for the persisted theme/accent preference.
 * Every mount-time sync must call getStoredTheme/getStoredAccent (which
 * read localStorage) rather than the current data-theme/data-accent
 * attribute on <html> — the attribute only reflects whatever the server
 * hard-coded (dark/primary) or whatever a sibling component already
 * wrote this session, so reading it drifts from the saved preference on
 * any page that mounts standalone (e.g. a hard refresh landing directly
 * on /privacy or /login).
 */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("bcc-theme") as Theme | null;
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function getStoredAccent(): Accent {
  if (typeof window === "undefined") return "primary";
  return (localStorage.getItem("bcc-accent") as Accent | null) ?? "primary";
}

export function applyTheme(theme: Theme, accent: Accent) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  html.setAttribute("data-accent", accent);
  localStorage.setItem("bcc-theme", theme);
  localStorage.setItem("bcc-accent", accent);
}
