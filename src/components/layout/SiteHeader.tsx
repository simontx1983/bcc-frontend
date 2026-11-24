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
import {
  BadgeCheck,
  Bell,
  ChevronDown,
  Compass,
  LogOut,
  MessageSquare,
  Moon,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useSession } from "next-auth/react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { Avatar } from "@/components/identity/Avatar";
import { OpenCasesPill, YOU_ITEMS, youItemHref } from "@/components/layout/nav-items";
import { ConversationsPanel } from "@/components/messages/ConversationsPanel";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { requestTour, SHOW_ME_AROUND_HREF, SHOW_ME_AROUND_TOUR } from "@/lib/tour/replay";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useOpenCaseCount } from "@/hooks/useOpenCaseCount";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { useUser } from "@/hooks/useUser";
import { HIT_AREA_44 } from "@/components/feed/hitArea";
import { sessionCanModerate } from "@/lib/auth/can-moderate";
import { applyTheme, getStoredAccent, getStoredTheme, type Accent, type Theme } from "@/lib/theme";

// Code-split — the sign-out confirm only mounts behind the SIGN OUT
// click, so its chunk stays out of the every-page header bundle.
const SignOutModal = dynamic(
  () =>
    import("@/components/auth/SignOutModal").then((m) => m.SignOutModal),
  { ssr: false }
);

// ── Types ─────────────────────────────────────────────────────────────────────

/** Operator shift status surfaced in HeaderRail / MobileMenuSheet. */
export type ShiftStatus = "on_duty" | "quiet" | "off";

// ── Shared modal dismiss hook ─────────────────────────────────────────────────

const POPOVER_FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared behaviour for the four header pop-ups (theme, messages,
 * notifications, avatar menu).
 *
 * F-325: they used to open without moving focus, let Tab walk out of them
 * (and, because they render after the avatar button, Tab from the bell
 * reached the avatar before the bell's own panel), and Esc closed them
 * leaving focus on <body>. Now, while open:
 *   - focus moves into the panel (its first control, else the panel);
 *   - Tab / Shift+Tab cycle inside it;
 *   - Esc closes it and returns focus to its trigger button;
 *   - a click outside closes it (focus stays where the click put it);
 *   - `menu: true` (the avatar menu) adds ArrowUp / ArrowDown / Home / End
 *     between its menu items.
 */
function useModalDismiss(
  modalRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLButtonElement | null>,
  onClose: () => void,
  opts: { menu?: boolean } = {},
) {
  const menu = opts.menu === true;

  // Focus into the panel once, on open — and give it back on close.
  //
  // On close, a panel that held focus is gone, and the browser drops focus
  // to <body>: keyboard users lose their place. So when the panel unmounts
  // and focus is inside it or on <body>, focus returns to the trigger —
  // UNLESS the close came from activating a link, which is navigating (the
  // panel's onClose runs from the link's onClick, before the URL changes,
  // so a route check at this point could not tell).
  useEffect(() => {
    const panel = modalRef.current;
    if (panel === null) return;
    const anchor = anchorRef.current;
    const first = menu
      ? panel.querySelector<HTMLElement>('[role="menuitem"]')
      : panel.querySelector<HTMLElement>(POPOVER_FOCUSABLE);
    (first ?? panel).focus();

    let navigating = false;
    const noteActivation = (e: Event) => {
      const target = e.target as Element | null;
      navigating = target?.closest?.("a[href]") != null;
    };
    panel.addEventListener("click", noteActivation, true);
    return () => {
      panel.removeEventListener("click", noteActivation, true);
      if (navigating) return;
      const active = document.activeElement;
      if (active === null || active === document.body || panel.contains(active)) {
        anchor?.focus();
      }
    };
  }, [modalRef, anchorRef, menu]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        modalRef.current && !modalRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      const panel = modalRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        anchorRef.current?.focus();
        return;
      }
      if (panel === null) return;
      if (e.key === "Tab") {
        const items = Array.from(panel.querySelectorAll<HTMLElement>(POPOVER_FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = active !== null && panel.contains(active);
        if (e.shiftKey && (!inside || active === first || active === panel)) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && (!inside || active === last)) {
          e.preventDefault();
          first?.focus();
        }
        return;
      }
      if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        if (items.length === 0) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next =
          e.key === "Home" ? 0
          : e.key === "End" ? items.length - 1
          : e.key === "ArrowDown" ? (at + 1) % items.length
          : (at - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [modalRef, anchorRef, onClose, menu]);
}

/** Panel ids, so each trigger can name the panel it controls. */
const POPOVER_IDS = {
  theme: "bcc-header-theme-panel",
  messages: "bcc-header-messages-panel",
  notifications: "bcc-header-notifications-panel",
  user: "bcc-header-user-menu",
  search: "bcc-header-search-panel",
} as const;

// ── Icons ─────────────────────────────────────────────────────────────────────
// Backed by lucide-react (task 5, icon standardization) — these were
// previously hand-redrawn here, at a different geometry than the same
// concepts elsewhere (NotificationBell, MessagesBadge, LeftSidebar…).

const CogIcon = () => <Settings size={18} aria-hidden strokeWidth={1.8} />;
const PaletteIcon = () => <Palette size={18} aria-hidden strokeWidth={1.8} />;
const ChatIcon = () => <MessageSquare size={18} aria-hidden strokeWidth={1.8} />;
const BellIcon = () => <Bell size={18} aria-hidden strokeWidth={1.8} />;
const ChevronDownIcon = ({ open }: { open: boolean }) => (
  <ChevronDown
    size={12}
    aria-hidden
    strokeWidth={2}
    style={{ transition: "transform 200ms ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
  />
);

// ── Shared modal shell style ──────────────────────────────────────────────────

const modalShellStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  // Capped to the viewport: below 1280px the modal is pinned 12px from the
  // right edge (globals.css), so a flat 320px ran off the left edge of a
  // 320px phone.
  width: "min(320px, calc(100vw - 24px))",
  borderRadius: "var(--bcc-radius-lg)",
  boxShadow: "var(--bcc-shadow-lg)",
  zIndex: 300,
  // Entrance fade lives on the shared `.bcc-header-modal` class
  // (motion-safe, in globals.css) rather than here — an inline
  // `animation` can't be gated for reduced motion.
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

// Full-strength text plus an underline: accent text on the light glass
// panel is ~2.4:1, and once the link is not coloured differently from
// its neighbours the underline is what marks it as a link (1.4.1).
const modalSeeAllStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: 11,
  color: "var(--bcc-text)",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  letterSpacing: "0.06em",
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
      id={POPOVER_IDS.theme}
      role="dialog"
      aria-modal="true"
      aria-label="Theme settings"
      tabIndex={-1}
      className="bcc-header-modal"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 240,
        borderRadius: "var(--bcc-radius-lg)",
        padding: "16px",
        zIndex: 300,
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
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
            fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 11,
            letterSpacing: "0.1em", textTransform: "uppercase",
            transition: "background 150ms ease, color 150ms ease",
            background: theme === t ? "var(--bcc-accent)" : "transparent",
            color: theme === t ? "var(--bcc-on-accent)" : "var(--bcc-text-secondary)",
          }}>
            {t === "light" ? <Sun size={13} aria-hidden strokeWidth={2} /> : <Moon size={13} aria-hidden strokeWidth={2} />}
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
          <button key={value} onClick={() => onAccentChange(value)}
            className={`bcc-theme-option${accent === value ? " selected" : ""}`}
            style={{ flex: 1, flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 8px" }}
            aria-pressed={accent === value}
          >
            <span className="bcc-accent-swatch" style={{ background: color }} />
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: accent === value ? "var(--bcc-text)" : "var(--bcc-text-secondary)" }}>
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
    <div ref={modalRef} id={POPOVER_IDS.messages} role="dialog" aria-modal="true" aria-label="Messages" tabIndex={-1} className="bcc-header-modal" style={modalShellStyle}>
      <div style={modalHeadStyle}>
        <span style={modalTitleStyle}>Messages</span>
        <Link href="/messages" style={modalSeeAllStyle} onClick={onClose}>
          See all
        </Link>
      </div>
      {/* Shared inbox preview panel — same rows as /messages
          (ConversationList) behind the same useConversations query.
          The "Quiet Inbox" copy lives inside the panel now, rendered
          only when the inbox is genuinely empty. MessagesModal only
          mounts for authed viewers (messagesOpen && viewerHandle), so
          enabled is unconditionally true here. */}
      <ConversationsPanel
        enabled={true}
        open={true}
        onNavigate={onClose}
      />
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
    <div ref={modalRef} id={POPOVER_IDS.notifications} role="dialog" aria-modal="true" aria-label="Notifications" tabIndex={-1} className="bcc-header-modal" style={modalShellStyle}>
      <div style={modalHeadStyle}>
        <span style={modalTitleStyle}>Notifications</span>
        <Link href={"/notifications" as Route} style={modalSeeAllStyle} onClick={onClose}>
          See all
        </Link>
      </div>
      {/* Shared §I1 list panel — same rows/states as the mobile bell
          (NotificationBell). showTitle={false}: the modal head above
          already carries the title + See-all link. NotifModal only
          mounts for authed viewers (notifOpen && viewerHandle), so
          enabled is unconditionally true here. */}
      <NotificationsPanel
        enabled={true}
        open={true}
        showTitle={false}
        onNavigate={onClose}
      />
    </div>
  );
}

// ── Avatar Dropdown ───────────────────────────────────────────────────────────

/*
 * Order (Site Structure A): the shared "You" items (nav-items YOU_ITEMS:
 * My profile · Standing · My Reliability · My cases · Settings), Show me
 * around, the Admin group when allowed, a rule, then Theme and Sign out.
 *
 * Admin: the only inbound links to the admin screens — without them the
 * §K1 reports queue has no way in and filed reports pile up unseen (it
 * regressed once, 2026-07-21 admin audit P1). Shown ONLY when the session's
 * `canModerate` is exactly true (bcc-trust #876, the admin routes' own
 * check). DISPLAY ONLY and fail-closed: absent, false or malformed hides
 * the group; every admin request is still checked by the server, and a
 * non-admin who reaches the URL gets the page's "Admin access required"
 * panel.
 */
const ADMIN_MENU = [
  { id: "moderation", label: "Moderation", href: "/admin/moderation", icon: <ShieldCheck size={16} strokeWidth={1.8} aria-hidden /> },
  { id: "validators", label: "Validators", href: "/admin/validators", icon: <BadgeCheck size={16} strokeWidth={1.8} aria-hidden /> },
] as const;

const ADMIN_GROUP_LABEL_ID = "bcc-header-admin-group";

interface AvatarDropdownProps {
  handle: string;
  /** From sessionCanModerate: exactly `true` shows the Admin group. */
  canModerate: boolean;
  /** From useOpenCaseCount: a whole number above zero, or null. */
  openCases: number | null;
  onClose: () => void;
  onTheme: () => void;
  onSignOut: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

function menuItemStyle(color: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: "var(--bcc-radius-md)",
    textDecoration: "none",
    color,
    fontSize: 13,
    fontFamily: "var(--font-serif), Georgia, serif",
    transition: "background 120ms ease, color 120ms ease",
    cursor: "pointer",
    background: "transparent",
    border: "none",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "left",
  };
}

const ICON_SLOT: React.CSSProperties = { width: 16, height: 16, flexShrink: 0, opacity: 0.8 };

function AvatarDropdown({ handle, canModerate, openCases, onClose, onTheme, onSignOut, anchorRef }: AvatarDropdownProps) {
  const dropRef = useRef<HTMLDivElement>(null);
  useModalDismiss(dropRef, anchorRef, onClose, { menu: true });

  const link = (key: string, href: Route, color: string, children: React.ReactNode, onPick?: () => void) => (
    <Link
      key={key}
      href={href}
      role="menuitem"
      onClick={() => {
        onPick?.();
        onClose();
      }}
      style={menuItemStyle(color)}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "var(--bcc-surface-hover)";
        el.style.color = "var(--bcc-accent)";
        el.style.fontWeight = "600";
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = "transparent";
        el.style.color = color;
        el.style.fontWeight = "normal";
      }}
    >
      {children}
    </Link>
  );

  return (
    <div
      ref={dropRef}
      id={POPOVER_IDS.user}
      role="menu"
      aria-label="User menu"
      tabIndex={-1}
      className="bcc-header-modal"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 220,
        borderRadius: "var(--bcc-radius-lg)",
        padding: "8px",
        zIndex: 300,
      }}
    >
      {/* Handle label */}
      <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--bcc-border-light)", marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-stencil), Impact, sans-serif", fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--bcc-text)" }}>
          @{handle}
        </span>
      </div>

      {/* Keyed on ids, never labels, so a copy edit cannot silently move
          the pill, break the tour, or turn Sign Out into a plain link. */}
      {YOU_ITEMS.map(item =>
        link(item.id, youItemHref(item, handle), "var(--bcc-text-secondary)", (
          <>
            <span style={ICON_SLOT}><item.Icon size={16} strokeWidth={1.8} aria-hidden /></span>
            {item.label}
            {item.id === "cases" && (
              <>
                {" "}
                <OpenCasesPill count={openCases} />
              </>
            )}
          </>
        )),
      )}

      {/* F-322: the tour auto-starts once per account; this is the only way
          back to it. Raises a request the TourProvider answers (SiteHeader
          sits outside it), then the link lands on the tour's surface. */}
      {link("tour", SHOW_ME_AROUND_HREF as Route, "var(--bcc-text-secondary)", (
        <>
          <span style={ICON_SLOT}><Compass size={16} strokeWidth={1.8} aria-hidden /></span>
          Show me around
        </>
      ), () => requestTour(SHOW_ME_AROUND_TOUR))}

      {canModerate && (
        <div role="group" aria-labelledby={ADMIN_GROUP_LABEL_ID}>
          <div
            id={ADMIN_GROUP_LABEL_ID}
            className="bcc-mono"
            style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--bcc-text-secondary)", padding: "10px 12px 4px" }}
          >
            Admin
          </div>
          {ADMIN_MENU.map(item =>
            link(item.id, item.href, "var(--bcc-text-safety)", (
              <>
                <span style={ICON_SLOT}>{item.icon}</span>
                {item.label}
              </>
            )),
          )}
        </div>
      )}

      <div role="separator" style={{ borderTop: "1px solid var(--bcc-border-light)", margin: "6px 0" }} />

      {/* Opens the Theme panel (Day / Night, accent) from here, so phones —
          whose header has no palette button — reach it from the avatar too. */}
      <button
        type="button"
        role="menuitem"
        aria-haspopup="dialog"
        style={menuItemStyle("var(--bcc-text-secondary)")}
        onClick={() => {
          onClose();
          onTheme();
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "var(--bcc-surface-hover)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={ICON_SLOT}><Palette size={16} strokeWidth={1.8} aria-hidden /></span>
        Theme
      </button>

      <button
        type="button"
        role="menuitem"
        style={menuItemStyle("var(--bcc-danger)")}
        onClick={() => {
          onClose();
          onSignOut();
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "rgb(var(--bcc-danger-rgb) / 0.08)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span style={ICON_SLOT}><LogOut size={16} strokeWidth={1.8} aria-hidden /></span>
        Sign Out
      </button>
    </div>
  );
}

// ── Mobile Search Overlay ─────────────────────────────────────────────────────

interface SearchOverlayProps {
  /** What the input opens holding (F-260 M12: /search's query there). */
  prefill: string;
  onClose: () => void;
  onSubmit: (query: string) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * The phone search panel. F-264: it was a hand-made dialog with no
 * aria-modal, no focus trap and no focus return, Esc worked only while
 * the input had focus, and its backdrop value carried a stray semicolon
 * (`"var(--bcc-glass-bg-frosted);"`), so the declaration was dropped and
 * the backdrop was clear. It now shares useModalDismiss with the other
 * four header pop-ups: focus moves to the input, Tab stays inside, Esc
 * from anywhere and a click outside (the backdrop) close it, and focus
 * goes back to the search button.
 *
 * Minimal wiring by design: Enter → /search?q= (the full combobox stays
 * desktop-only for now; the /search results page carries the mobile
 * experience).
 */
function SearchOverlay({ prefill, onClose, onSubmit, anchorRef }: SearchOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalDismiss(panelRef, anchorRef, onClose);

  return (
    <>
      {/* Backdrop. A click on it is outside the panel, so useModalDismiss
          closes the overlay. Fade gated on motion-safe so a reduced-motion
          user gets no animation (globals.css has no global reduce
          kill-switch; inline styles can't carry a media query). */}
      <div
        data-testid="search-overlay-backdrop"
        className="motion-safe:[animation:bcc-fade-in_0.2s_ease]"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 299,
          background: "var(--bcc-glass-bg-frosted)",
          backdropFilter: "var(--bcc-blur-sm)",
        }}
      />
      <div
        ref={panelRef}
        id={POPOVER_IDS.search}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        className="motion-safe:[animation:bcc-fade-in_0.15s_ease_forwards]"
        style={{
          position: "fixed",
          top: "calc(var(--bcc-header-h) + 12px)",
          // Landscape notch (F-355 viewport-fit=cover): centre within
          // the safe area, not the raw screen edge.
          left: "env(safe-area-inset-left, 0px)",
          right: "env(safe-area-inset-right, 0px)",
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
        }}
      >
        <input
          type="search"
          defaultValue={prefill}
          placeholder="Search BCC…"
          className="bcc-search-input"
          style={{ width: "100%" }}
          aria-label="Search BCC"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const q = e.currentTarget.value.trim();
              if (q.length > 0) onSubmit(q);
            }
          }}
        />
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SiteHeader() {
  // Root layout resolves the session server-side and hands it to
  // SessionProvider as initial state, so this is "authenticated" /
  // "unauthenticated" on the very first render — no "loading" status,
  // no skeleton branch needed here.
  const { data: session } = useSession();
  const viewerHandle = session?.user?.handle ?? null;
  // The session/JWT never carries an avatar_url — fetch the viewer's own
  // profile for it, same seam MainOffcanvas's identity card uses.
  const { data: viewerProfile } = useUser(viewerHandle ?? "", { enabled: viewerHandle !== null });
  const pathname   = usePathname() ?? "/";
  const router     = useRouter();

  // Button refs (for modal anchor positioning + dismiss detection)
  const paletteRef  = useRef<HTMLButtonElement>(null);
  const messagesRef = useRef<HTMLButtonElement>(null);
  const notifRef    = useRef<HTMLButtonElement>(null);
  const avatarRef   = useRef<HTMLButtonElement>(null);

  // Theme state
  const [theme,  setTheme]  = useState<Theme>("dark");
  const [accent, setAccent] = useState<Accent>("primary");

  // Bell unread badge — reads the shared BadgesProvider polling via
  // useUnreadCount (no extra request; same source as the mobile
  // NotificationBell). BadgesProvider gates anon viewers itself.
  const notifUnread = useUnreadCount({ enabled: viewerHandle !== null });
  const notifUnreadCount = notifUnread.data?.unread_count ?? 0;

  // Chat unread badge — selects the messages_unread slice of the SAME
  // BadgesProvider /me/badges payload (see useUnreadMessageCount.ts);
  // zero additional polling. Auth gating is centralised in the
  // provider, so no enabled flag is passed here.
  const msgUnread = useUnreadMessageCount();
  const msgUnreadCount = msgUnread.data?.count ?? 0;

  // Open cases — the disputes_open slice of the same /me/badges poll.
  // null unless it is a whole number above zero: then no dot, no pill.
  const openCases = useOpenCaseCount();

  // Admin group: display only, shown for exactly `true` (see ADMIN_MENU).
  const canModerate = sessionCanModerate(session);

  // Modal open state — only one can be open at a time
  const [themeOpen,    setThemeOpen]    = useState(false);
  // Which control opened the Theme panel (the palette, or the avatar
  // menu's Theme item), so Esc hands focus back to that one.
  const [themeFromAvatar, setThemeFromAvatar] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [avatarOpen,   setAvatarOpen]   = useState(false);

  // Sign-out confirmation dropdown 
  const [showSignOut, setShowSignOut] = useState(false);

  // Mobile: track viewport width to show search icon vs search bar
  const isMobile = useIsMobile();

  // Mobile search overlay open state
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const searchIconRef = useRef<HTMLButtonElement>(null);
  // What the overlay's input opens holding: on /search, the page's query
  // (F-260 M12), so refining a search doesn't mean retyping it. Read from
  // window.location when the overlay opens, not via useSearchParams,
  // which would need a Suspense boundary around the whole header.
  const [searchOverlayPrefill, setSearchOverlayPrefill] = useState("");
  const toggleSearchOverlay = () => {
    if (!searchOverlayOpen) {
      setSearchOverlayPrefill(
        pathname === "/search"
          ? (new URLSearchParams(window.location.search).get("q") ?? "").trim()
          : "",
      );
    }
    setSearchOverlayOpen((o) => !o);
  };

  // Restore theme preference on mount
  useEffect(() => {
    const t = getStoredTheme();
    const a = getStoredAccent();
    setTheme(t);
    setAccent(a);
    applyTheme(t, a);
  }, []);

  // Mutual-exclusion helpers — opening one closes all others
  function closeAll() { setThemeOpen(false); setMessagesOpen(false); setNotifOpen(false); setAvatarOpen(false); }
  function openTheme(fromAvatar = false) { closeAll(); setThemeFromAvatar(fromAvatar); setThemeOpen(true); }
  function openMessages() { closeAll(); setMessagesOpen(true); }
  function openNotif()    { closeAll(); setNotifOpen(true);    }
  function openAvatar()   { closeAll(); setAvatarOpen(true);   }

  // Shared active icon style
  function activeStyle(open: boolean): React.CSSProperties | undefined {
    // Full-strength glyph, not --bcc-accent: accent on its own subtle tint
    // is 2.23:1 in light theme, below the 3:1 an icon needs. The tint
    // (and the open popover itself) carries the state.
    return open ? { color: "var(--bcc-text)", background: "var(--bcc-accent-subtle)" } : undefined;
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

      {/* ── Search — §G1 combobox (suggestions via cards/search,
             trending + recents pre-search surface, keyboard nav).
             GlobalSearch owns the role="search" landmark and the
             "/" + ⌘K focus shortcut; this wrapper is only the layout
             slot (hidden ≤599px by the .bcc-search media query — the
             mobile overlay below takes over). The magnifier sits as a
             sibling so the .bcc-search-icon absolute positioning keeps
             working against the .bcc-search relative box. ── */}
      <div className="bcc-search">
        <GlobalSearch
          className="w-full"
          inputClassName="bcc-search-input"
          placeholder="Search BCC…  /"
          focusShortcut
        />
        <span className="bcc-search-icon" aria-hidden>
          <Search size={16} strokeWidth={1.8} />
        </span>
      </div>

      {/* ── Right controls ── */}
      <div className="bcc-header-actions" style={{ position: "relative" }}>

        {/* Search icon — mobile only, shown via CSS class */}
        {isMobile && (
          <button
            ref={searchIconRef}
            onClick={toggleSearchOverlay}
            aria-haspopup="dialog"
            aria-expanded={searchOverlayOpen}
            aria-controls={searchOverlayOpen ? POPOVER_IDS.search : undefined}
            className="bcc-btn-icon bcc-header-search-icon-btn"
            aria-label="Search"
            title="Search"
          >
            <Search size={18} aria-hidden strokeWidth={1.8} />
          </button>)}

        {/* Palette — theme/accent */}
        {!isMobile && (
          <button
          ref={paletteRef}
          onClick={() => themeOpen ? setThemeOpen(false) : openTheme()}
          aria-haspopup="dialog"
          aria-expanded={themeOpen}
          aria-controls={themeOpen ? POPOVER_IDS.theme : undefined}
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
          href="/u/me?tab=profile"
          className={`bcc-btn-icon bcc-header-settings-btn${pathname.startsWith("/settings") ? " active" : ""}`}
          aria-label="Settings"
          title="Settings"
          style={activeStyle(pathname.startsWith("/settings"))}
        >
          <CogIcon />
        </Link>)}

        {/* Messages */}
        {viewerHandle &&
          <button
          ref={messagesRef}
          onClick={() => messagesOpen ? setMessagesOpen(false) : openMessages()}
          aria-haspopup="dialog"
          aria-expanded={messagesOpen}
          aria-controls={messagesOpen ? POPOVER_IDS.messages : undefined}
          className={`bcc-btn-icon${messagesOpen ? " active" : ""}`}
          aria-label={
            msgUnreadCount > 0
              ? `Messages — ${msgUnreadCount} unread`
              : "Messages"
          }
          title="Messages"
          style={{ position: "relative", ...activeStyle(messagesOpen) }}
        >
          <ChatIcon />
          {/* Unread badge — same chip classes as the bell badge below
              and MessagesBadge; count capped at "9+" like the bell.
              Background is the active accent (not Phillip's "safety"
              red) so it tracks the user's chosen accent color. */}
          {msgUnreadCount > 0 && (
            <span
              aria-hidden
              className="bcc-mono absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--bcc-accent)] px-1 text-[9px] font-semibold leading-none text-bcc-on-accent"
            >
              {msgUnreadCount > 9 ? "9+" : msgUnreadCount}
            </span>
          )}
        </button>}

        {/* Notifications — authed only, on every width. It was desktop-only
            on the promise that it "moves to offcanvas", which never landed,
            so phones had no way to reach notifications at all (C1, UX scan
            2026-11-12). Same modal as Messages, which already ships on
            mobile. */}
        {viewerHandle && (
          <button
            ref={notifRef}
            onClick={() => notifOpen ? setNotifOpen(false) : openNotif()}
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            aria-controls={notifOpen ? POPOVER_IDS.notifications : undefined}
            className={`bcc-btn-icon bcc-header-notif-btn${notifOpen ? " active" : ""}`}
            aria-label={
              notifUnreadCount > 0
                ? `Notifications — ${notifUnreadCount} unread`
                : "Notifications"
            }
            title="Notifications"
            style={{ position: "relative", ...activeStyle(notifOpen) }}
          >
            <BellIcon />
            {/* Unread badge — same chip classes as MessagesBadge;
                count capped at "9+", the same as the Messages badge.
                Background is the active accent (not Phillip's "safety"
                red) so it tracks the user's chosen accent color. */}
            {notifUnreadCount > 0 && (
              <span
                aria-hidden
                className="bcc-mono absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--bcc-accent)] px-1 text-[9px] font-semibold leading-none text-bcc-on-accent"
              >
                {notifUnreadCount > 9 ? "9+" : notifUnreadCount}
              </span>
            )}
          </button>
        )}

        {/* Mobile search overlay (F-264: on useModalDismiss, like the
            other four pop-ups). */}
        {searchOverlayOpen && (
          <SearchOverlay
            prefill={searchOverlayPrefill}
            anchorRef={searchIconRef}
            onClose={() => setSearchOverlayOpen(false)}
            onSubmit={(q) => {
              setSearchOverlayOpen(false);
              router.push(`/search?q=${encodeURIComponent(q)}`);
            }}
          />
        )}

        {/* Avatar / Sign in */}
        {viewerHandle ? (
          <button
            ref={avatarRef}
            onClick={() => avatarOpen ? setAvatarOpen(false) : openAvatar()}
            aria-label={
              openCases !== null
                ? `User menu — ${openCases} open ${openCases === 1 ? "case" : "cases"}`
                : "User menu"
            }
            aria-haspopup="menu"
            aria-expanded={avatarOpen}
            aria-controls={avatarOpen ? POPOVER_IDS.user : undefined}
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
            {/* Ring + halo match the offcanvas avatar treatment
                (MainOffcanvas) so the identity affordance is consistent
                wherever the avatar appears. The surface-hover background
                override gives the placeholder visible contrast against
                the light-mode header (--bcc-surface-raised is nearly
                indistinguishable from --bcc-header-bg there), matching
                how it already reads in dark mode. */}
            <span style={{ pointerEvents: "none", position: "relative", display: "inline-flex" }}>
              <Avatar
                avatarUrl={viewerProfile?.avatar_url}
                handle={viewerHandle}
                displayName={session?.user?.name}
                size="sm"
                ringColor="var(--bcc-accent)"
              />
              {/* Open-case dot: status, not a call to act. The count is
                  in the button's name and on My cases in the menu. */}
              {openCases !== null && (
                <span
                  aria-hidden
                  data-testid="avatar-open-cases-dot"
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bcc-bg bg-safety"
                />
              )}
            </span>
            <ChevronDownIcon open={avatarOpen} />
          </button>
        ) : (
          // Both at every width (Structure A): phones used to get Sign Up
          // only, with Sign In one level down in the Menu.
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/signup" className={`${HIT_AREA_44} bcc-btn bcc-btn-sm bcc-btn-primary`}>
              Sign Up
            </Link>
            <Link href="/login" className={`${HIT_AREA_44} bcc-btn bcc-btn-sm bcc-btn-ghost bcc-header-signin-btn`}>
              Sign In
            </Link>
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
            anchorRef={themeFromAvatar ? avatarRef : paletteRef}
          />
        )}

        {messagesOpen && viewerHandle && (
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
            canModerate={canModerate}
            openCases={openCases}
            onClose={() => setAvatarOpen(false)}
            onTheme={() => openTheme(true)}
            onSignOut={() => setShowSignOut(true)}
            anchorRef={avatarRef}
          />
        )}

        {showSignOut && <SignOutModal onClose={() => setShowSignOut(false)} />}

      </div>
    </header>
  );
}
