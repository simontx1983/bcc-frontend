"use client";

/**
 * SiteHeader — fixed glass header bar.
 *
 * Layout: [Logo] ......... [Search] ......... [Palette] [Settings] [Messages] [Notifications] [Avatar ▾]
 *
 * - Palette     → theme/accent modal
 * - Settings    → links to /settings/profile
 * - Messages    → inline modal (recent messages or empty state)
 * - Notifs      → inline modal (notifications or empty state) — authed only
 * - Avatar      → dropdown with user nav
 */

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SignOutModal } from "@/components/auth/SignOutModal";

// ── Types ─────────────────────────────────────────────────────────────────────

type Theme  = "light" | "dark";
type Accent = "primary" | "secondary";

/** Operator shift status surfaced in HeaderRail / MobileMenuSheet. */
export type ShiftStatus = "on_duty" | "quiet" | "off";

// ── Theme helpers ─────────────────────────────────────────────────────────────

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("bcc-theme") as Theme | null;
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredAccent(): Accent {
  if (typeof window === "undefined") return "primary";
  return (localStorage.getItem("bcc-accent") as Accent | null) ?? "primary";
}

function applyTheme(theme: Theme, accent: Accent) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  html.setAttribute("data-accent", accent);
  localStorage.setItem("bcc-theme", theme);
  localStorage.setItem("bcc-accent", accent);
}

// ── Shared modal dismiss hook ─────────────────────────────────────────────────

function useModalDismiss(
  modalRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        modalRef.current && !modalRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [modalRef, anchorRef, onClose]);
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const CogIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M9 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M14.5 9c0-.28-.02-.55-.06-.82l1.76-1.37-1.5-2.6-2.1.85a6.5 6.5 0 00-1.42-.82L10.8 2h-3l-.38 2.24c-.51.2-.99.48-1.42.82l-2.1-.85-1.5 2.6 1.76 1.37A6.6 6.6 0 003.5 9c0 .28.02.55.06.82L1.8 11.19l1.5 2.6 2.1-.85c.43.34.91.62 1.42.82L7.2 16h3l.38-2.24c.51-.2.99-.48 1.42-.82l2.1.85 1.5-2.6-1.76-1.37c.04-.27.06-.54.06-.82z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const PaletteIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M9 2a7 7 0 100 14c1.1 0 2-.9 2-2v-.5c0-.28.22-.5.5-.5H13a3 3 0 003-3A7 7 0 009 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <circle cx="6"  cy="8"   r="1" fill="currentColor"/>
    <circle cx="9"  cy="5.5" r="1" fill="currentColor"/>
    <circle cx="12" cy="8"   r="1" fill="currentColor"/>
  </svg>
);

const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M2 3.5A1.5 1.5 0 013.5 2h11A1.5 1.5 0 0116 3.5v8A1.5 1.5 0 0114.5 13H6l-4 3V3.5z"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
);

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
    <path d="M9 2a4.5 4.5 0 00-4.5 4.5V9L3 11h12l-1.5-2V6.5A4.5 4.5 0 009 2z"
      stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M7 13.5a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Shared modal shell style ──────────────────────────────────────────────────

const modalShellStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 320,
  borderRadius: "var(--bcc-radius-lg)",
  boxShadow: "var(--bcc-shadow-lg)",
  zIndex: 300,
  animation: "bcc-fade-in 0.15s ease forwards",
  overflow: "hidden",
};

const modalHeadStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--bcc-border-light)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const modalTitleStyle: React.CSSProperties = {
  fontFamily: "var(--font-stencil), Impact, sans-serif",
  fontWeight: 800,
  fontSize: 13,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const modalSeeAllStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
  color: "var(--bcc-accent)",
  letterSpacing: "0.06em",
};

const modalEmptyStyle: React.CSSProperties = {
  padding: "32px 20px",
  textAlign: "center",
};

// ── Theme Modal ───────────────────────────────────────────────────────────────

interface ThemeModalProps {
  theme: Theme;
  accent: Accent;
  onThemeChange: (t: Theme) => void;
  onAccentChange: (a: Accent) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function ThemeModal({ theme, accent, onThemeChange, onAccentChange, onClose, anchorRef }: ThemeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalDismiss(modalRef, anchorRef, onClose);

  return (
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

      {/* Day / Night pill */}
      <div style={{ display: "flex", background: "var(--bcc-bg-elevated)", borderRadius: "var(--bcc-radius-full)", padding: 3, marginBottom: 16, border: "1px solid var(--bcc-border)" }}>
        {(["light", "dark"] as Theme[]).map(t => (
          <button key={t} onClick={() => onThemeChange(t)} style={{
            flex: 1, padding: "6px 0", borderRadius: "var(--bcc-radius-full)", border: "none", cursor: "pointer",
            fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 11,
            letterSpacing: "0.1em", textTransform: "uppercase",
            transition: "background 150ms ease, color 150ms ease",
            background: theme === t ? "var(--bcc-accent)" : "transparent",
            color: theme === t ? "#fff" : "var(--bcc-text-secondary)",
          }}>
            {t === "light" ? "☀ Day" : "☾ Night"}
          </button>
        ))}
      </div>

      <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 10 }}>
        Accent
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        {[
          { value: "primary"   as Accent, color: "#16b5e6", label: "Blue"   },
          { value: "secondary" as Accent, color: "#f98a1c", label: "Orange" },
        ].map(({ value, color, label }) => (
          <button key={value} onClick={() => onAccentChange(value)}
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
  );
}

// ── Messages Modal ────────────────────────────────────────────────────────────

interface MessagesModalProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function MessagesModal({ onClose, anchorRef }: MessagesModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalDismiss(modalRef, anchorRef, onClose);

  return (
    <div ref={modalRef} role="dialog" aria-label="Messages" className="bcc-header-modal" style={modalShellStyle}>
      <div style={modalHeadStyle}>
        <span style={modalTitleStyle}>Messages</span>
        <Link href="/messages" style={modalSeeAllStyle} onClick={onClose}>
          See all
        </Link>
      </div>
      <div style={modalEmptyStyle}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>📭</div>
        <p style={{ fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 8 }}>
          Quiet Inbox
        </p>
        <p style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 13, color: "var(--bcc-text-secondary)", lineHeight: 1.6 }}>
          No conversations yet. Start one from the directory — every operator has a file, every file has a Message button.
        </p>
      </div>
    </div>
  );
}

// ── Notifications Modal ───────────────────────────────────────────────────────

interface NotifModalProps {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function NotifModal({ onClose, anchorRef }: NotifModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalDismiss(modalRef, anchorRef, onClose);

  return (
    <div ref={modalRef} role="dialog" aria-label="Notifications" className="bcc-header-modal" style={modalShellStyle}>
      <div style={modalHeadStyle}>
        <span style={modalTitleStyle}>Notifications</span>
        <Link href={"/notifications" as Route} style={modalSeeAllStyle} onClick={onClose}>
          See all
        </Link>
      </div>
      <div style={modalEmptyStyle}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>🔔</div>
        <p style={{ fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bcc-text)", marginBottom: 8 }}>
          All Clear
        </p>
        <p style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 13, color: "var(--bcc-text-secondary)", lineHeight: 1.6 }}>
          No notifications yet. Activity from your network will show up here.
        </p>
      </div>
    </div>
  );
}

// ── Avatar Dropdown ───────────────────────────────────────────────────────────

const AVATAR_MENU = [
  { label: "My Profile",    href: "/u/[handle]",     icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2.5 14c0-2.76 2.46-4.5 5.5-4.5s5.5 1.74 5.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { label: "My Progression",href: "/me/progression", icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 3 3 5-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { label: "Settings",      href: "/settings/profile",icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4"/><path d="M13 8c0-.25-.02-.49-.05-.73l1.55-1.2-1.25-2.17-1.85.75a5.5 5.5 0 00-1.26-.73L9.8 2H6.2l-.34 1.92c-.45.18-.87.43-1.26.73l-1.85-.75L1.5 6.07l1.55 1.2A5.6 5.6 0 003 8c0 .25.02.49.05.73L1.5 9.93l1.25 2.17 1.85-.75c.39.3.81.55 1.26.73L6.2 14h3.6l.34-1.92c.45-.18.87-.43 1.26-.73l1.85.75 1.25-2.17-1.55-1.2C12.98 8.49 13 8.25 13 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> },
  { label: "Sign Out",      href: "/api/auth/signout",icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10.5 11.5L14 8l-3.5-3.5M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
] as const;

interface AvatarDropdownProps {
  handle: string;
  onClose: () => void;
  onSignOut: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function AvatarDropdown({ handle, onClose, onSignOut, anchorRef }: AvatarDropdownProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  useModalDismiss(dropRef, anchorRef, onClose);

  return (
    <div
      ref={dropRef}
      role="menu"
      aria-label="User menu"
      className="bcc-header-modal"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 220,
        borderRadius: "var(--bcc-radius-lg)",
        padding: "8px",
        zIndex: 300,
        animation: "bcc-fade-in 0.15s ease forwards",
      }}
    >
      {/* Handle label */}
      <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--bcc-border-light)", marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bcc-text)" }}>
          @{handle}
        </span>
      </div>

      {AVATAR_MENU.map(item => {
        const href = item.href.replace("[handle]", handle);
        const isDanger = item.label === "Sign Out";
        const sharedStyle = {
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          borderRadius: "var(--bcc-radius-md)",
          textDecoration: "none",
          color: isDanger ? "var(--bcc-danger)" : "var(--bcc-text-secondary)",
          fontSize: 13,
          fontFamily: "var(--font-serif), Georgia, serif",
          transition: "background 120ms ease, color 120ms ease",
          marginTop: isDanger ? 4 : 0,
          borderTop: isDanger ? "1px solid var(--bcc-border-light)" : "none",
          cursor: "pointer",
          background: "transparent",
          border: isDanger ? "none" : undefined,
          borderTopWidth: isDanger ? 1 : undefined,
          borderTopStyle: isDanger ? "solid" as const : undefined,
          borderTopColor: isDanger ? "var(--bcc-border-light)" : undefined,
          width: "100%",
          boxSizing: "border-box" as const,
        };

        if (isDanger) {
          return (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              style={sharedStyle}
              onClick={() => {
                onClose();
                onSignOut();
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.8 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        }

        return (
          <Link
            key={item.label}
            href={href as Route}
            role="menuitem"
            onClick={onClose}
            style={sharedStyle}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "var(--bcc-surface-hover)";
              (e.currentTarget as HTMLElement).style.color = "var(--bcc-text)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "var(--bcc-text-secondary)";
            }}
          >
            <span style={{ width: 16, height: 16, flexShrink: 0, opacity: 0.8 }}>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SiteHeader() {
  const { data: session, status } = useSession();
  const viewerHandle = session?.user?.handle ?? null;
  const isLoading = status === "loading";
  const pathname   = usePathname() ?? "/";
  const router     = useRouter();
  const searchRef  = useRef<HTMLInputElement>(null);

  // Button refs (for modal anchor positioning + dismiss detection)
  const paletteRef  = useRef<HTMLButtonElement>(null);
  const messagesRef = useRef<HTMLButtonElement>(null);
  const notifRef    = useRef<HTMLButtonElement>(null);
  const avatarRef   = useRef<HTMLButtonElement>(null);

  // Theme state
  const [theme,  setTheme]  = useState<Theme>("dark");
  const [accent, setAccent] = useState<Accent>("primary");

  // Search state
  const [search, setSearch] = useState("");

  // Modal open state — only one can be open at a time
  const [themeOpen,    setThemeOpen]    = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [avatarOpen,   setAvatarOpen]   = useState(false);

  // Sign-out confirmation dropdown 
  const [showSignOut, setShowSignOut] = useState(false);

  // Mobile: track viewport width to show search icon vs search bar
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 599);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Mobile search overlay open state
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const searchIconRef = useRef<HTMLButtonElement>(null);

  // Restore theme preference on mount
  useEffect(() => {
    const t = getStoredTheme();
    const a = getStoredAccent();
    setTheme(t);
    setAccent(a);
    applyTheme(t, a);
  }, []);

  // ⌘K / `/` focuses search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if ((e.key === "/" && !["INPUT", "TEXTAREA"].includes(tag)) ||
          ((e.metaKey || e.ctrlKey) && e.key === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Mutual-exclusion helpers — opening one closes all others
  function closeAll() { setThemeOpen(false); setMessagesOpen(false); setNotifOpen(false); setAvatarOpen(false); }
  function openTheme()    { closeAll(); setThemeOpen(true);    }
  function openMessages() { closeAll(); setMessagesOpen(true); }
  function openNotif()    { closeAll(); setNotifOpen(true);    }
  function openAvatar()   { closeAll(); setAvatarOpen(true);   }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/members?q=${encodeURIComponent(search.trim())}`);
      setSearch("");
    }
  }

  // Shared active icon style
  function activeStyle(open: boolean): React.CSSProperties | undefined {
    return open ? { color: "var(--bcc-accent)", background: "var(--bcc-accent-subtle)" } : undefined;
  }

  return (
    <header className="bcc-header">

      {/* ── Blur layer — sibling to content, carries backdrop-filter so modals can blur freely ── */}
      <div className="bcc-header-blur-layer" aria-hidden />

      {/* ── Logo ── */}
      <Link href="/" className="bcc-brand" aria-label="BCC Home">
        <Image
          src="/images/Blue_Collar_Crypto_Logo.png"
          alt="Blue Collar Crypto"
          width={36}
          height={36}
          className="bcc-brand-logo"
          priority
        />
        <span className="bcc-brand-wordmark">
          <span className="bcc-brand-top">Blue Collar</span>
          <span className="bcc-brand-bottom">Crypto</span>
        </span>
      </Link>

      {/* ── Search ── */}
      <form
        onSubmit={handleSearch}
        className="bcc-search"
        role="search"
        style={{ flex: 1, maxWidth: 480, margin: "0 auto" }}
      >
        <input
          ref={searchRef}
          type="search"
          placeholder="Search BCC…  /"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bcc-search-input"
          aria-label="Search BCC"
        />
        <span className="bcc-search-icon" aria-hidden>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
      </form>

      {/* ── Right controls ── */}
      <div className="bcc-header-actions" style={{ position: "relative" }}>

        {/* Search icon — mobile only, shown via CSS class */}
        {isMobile && (
          <button
            ref={searchIconRef}
            onClick={() => setSearchOverlayOpen(o => !o)}
            className="bcc-btn-icon bcc-header-search-icon-btn"
            aria-label="Search"
            title="Search"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <circle cx="7.5" cy="7.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 12l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>)}

        {/* Palette — theme/accent */}
        {!isMobile && (
          <button
          ref={paletteRef}
          onClick={() => themeOpen ? setThemeOpen(false) : openTheme()}
          className={`bcc-btn-icon bcc-header-palette-btn${themeOpen ? " active" : ""}`}
          aria-label="Theme settings"
          title="Theme & accent"
          style={activeStyle(themeOpen)}
        >
          <PaletteIcon />
        </button>)}

        {/* Settings — links to profile edit */}
        {viewerHandle && !isMobile && (
         <Link
          href="/settings/profile"
          className={`bcc-btn-icon bcc-header-settings-btn${pathname.startsWith("/settings") ? " active" : ""}`}
          aria-label="Settings"
          title="Settings"
          style={pathname.startsWith("/settings") ? { color: "var(--bcc-accent)", background: "var(--bcc-accent-subtle)" } : undefined}
        >
          <CogIcon />
        </Link>)}

        {/* Messages */}
        {viewerHandle && 
          <button
          ref={messagesRef}
          onClick={() => messagesOpen ? setMessagesOpen(false) : openMessages()}
          className={`bcc-btn-icon${messagesOpen ? " active" : ""}`}
          aria-label="Messages"
          title="Messages"
          style={activeStyle(messagesOpen)}
        >
          <ChatIcon />
        </button>}

        {/* Notifications — authed only, hidden on mobile via CSS class */}
        {viewerHandle &&!isMobile && (
          <button
            ref={notifRef}
            onClick={() => notifOpen ? setNotifOpen(false) : openNotif()}
            className={`bcc-btn-icon bcc-header-notif-btn${notifOpen ? " active" : ""}`}
            aria-label="Notifications"
            title="Notifications"
            style={activeStyle(notifOpen)}
          >
            <BellIcon />
          </button>
        )}

        {/* Mobile search overlay */}
        {searchOverlayOpen && (
          <>
          {/* Backdrop Overlay */}
          <div
            onClick={() => setSearchOverlayOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 299,
              background: "var(--bcc-glass-bg-frosted);",
              backdropFilter: "var(--bcc-blur-sm)",
              animation: "bcc-fade-in 0.2s ease",
            }}
          />
          <div
            role="dialog"
            aria-label="Search"
            style={{
              position: "fixed",
              top: "calc(var(--bcc-header-h) + 12px)",
              left: 0,
              right: 0,
              marginLeft: "auto",
              marginRight: "auto",
              zIndex: 300,
              padding: "8px",
              background: "var(--bcc-glass-bg-solid)",
              backdropFilter: "blur(20px) saturate(160%)",
              WebkitBackdropFilter: "blur(20px) saturate(160%)",
              borderBottom: "1px solid var(--bcc-glass-border)",
              boxShadow: "var(--bcc-shadow-lg)",
              width: "80%",
              borderRadius: "var(--bcc-radius-xl)",
              animation: "bcc-fade-in 0.15s ease forwards",
            }}
          >
            <input
              autoFocus
              type="search"
              placeholder="Search BCC…"
              className="bcc-search-input"
              style={{ width: "100%" }}
              onKeyDown={e => e.key === "Escape" && setSearchOverlayOpen(false)}
            />
          </div>
          </>
        )}

        {/* Avatar / Sign in */}
        {isLoading ? (
          <div style={{ width: 32, height: 32, borderRadius: "var(--bcc-radius-md)", background: "var(--bcc-surface-hover)", opacity: 0.5 }} />
        ) : viewerHandle ? (
          <button
            ref={avatarRef}
            onClick={() => avatarOpen ? setAvatarOpen(false) : openAvatar()}
            aria-label="User menu"
            aria-expanded={avatarOpen}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "4px 6px",
              borderRadius: "var(--bcc-radius-md)",
              transition: "background 120ms ease",
              color: "var(--bcc-text-secondary)",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--bcc-surface-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <span
              className="bcc-avatar bcc-avatar-sm bcc-stencil"
              style={{ fontSize: 12, pointerEvents: "none" }}
            >
              {viewerHandle.slice(0, 2).toUpperCase()}
            </span>
            <ChevronDownIcon />
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/signup" className="bcc-btn bcc-btn-sm bcc-btn-primary">
              Sign Up
            </Link>
            {!isMobile && (
              <Link href="/login" className="bcc-btn bcc-btn-sm bcc-btn-ghost bcc-header-signin-btn">
                Sign In
              </Link>
            )}
          </div>
        )}

        {/* ── Modals ── */}

        {themeOpen && (
          <ThemeModal
            theme={theme}
            accent={accent}
            onThemeChange={t => { setTheme(t); applyTheme(t, accent); }}
            onAccentChange={a => { setAccent(a); applyTheme(theme, a); }}
            onClose={() => setThemeOpen(false)}
            anchorRef={paletteRef}
          />
        )}

        {messagesOpen && (
          <MessagesModal
            onClose={() => setMessagesOpen(false)}
            anchorRef={messagesRef}
          />
        )}

        {notifOpen && viewerHandle && (
          <NotifModal
            onClose={() => setNotifOpen(false)}
            anchorRef={notifRef}
          />
        )}

        {avatarOpen && viewerHandle && (
          <AvatarDropdown
            handle={viewerHandle}
            onClose={() => setAvatarOpen(false)}
            onSignOut={() => setShowSignOut(true)}
            anchorRef={avatarRef}
          />
        )}

        {showSignOut && <SignOutModal onClose={() => setShowSignOut(false)} />}

      </div>
    </header>
  );
}
