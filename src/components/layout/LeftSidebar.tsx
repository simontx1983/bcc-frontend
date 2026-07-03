"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const PRIMARY_NAV = [
  { label: "Home",        href: "/",           icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M7.5 18v-5h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> },
  { label: "Members",     href: "/members",     icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.6"/><path d="M2 17c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="15" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.4"/><path d="M17.5 16c0-2.5-1.5-4-3.5-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
  { label: "Directory",   href: "/directory",   icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><rect x="2" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="11" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="2" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/><rect x="11" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/></svg> },
  { label: "Communities", href: "/communities", icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6"/><ellipse cx="10" cy="10" rx="3.5" ry="7.5" stroke="currentColor" strokeWidth="1.6"/><path d="M2.5 10h15" stroke="currentColor" strokeWidth="1.6"/></svg> },
  { label: "Messages",    href: "/messages",    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H6l-4 3V4z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> },
  { label: "Disputes",    href: "/disputes",    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 2l2.2 5.5H18l-4.6 3.3 1.8 5.5L10 13l-5.2 3.3 1.8-5.5L2 7.5h5.8L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> },
  { label: "Watching",    href: "/watching",    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.6"/></svg> },
  { label: "Validators",  href: "/validators",  icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden><path d="M10 2l2 4.5L17 7l-3.5 3.5.8 5L10 13l-4.3 2.5.8-5L3 7l5-.5L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg> },
] as const;

const QUICK_LINKS = [
  { label: "My Progression", href: "/me/progression" },
  { label: "My Reliability",  href: "/me/reliability"  },
  { label: "Panel Duty",      href: "/panel"            },
  { label: "Settings",        href: "/settings/profile" },
] as const;

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden
      style={{ transition: "transform 200ms ease", transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

interface LeftSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function LeftSidebar({ collapsed, onToggle }: LeftSidebarProps) {
  const pathname = usePathname() ?? "/";
  // Session is resolved server-side and seeded into SessionProvider (see
  // SiteHeader) — authed/anon on first render, no loading branch needed.
  const { data: session } = useSession();
  const handle = session?.user?.handle ?? null;

  const iconOnlyItem: React.CSSProperties = {
    justifyContent: "center",
    padding: "10px 0",
    margin: "2px auto",
    width: 40,
  };

  return (
    <div className="bcc-sidebar-content" style={{ padding: 0 }}>

      {/* ── Compose button ── */}
      <div className="bcc-sidebar-pin-top" style={{ padding: collapsed ? "12px 8px 8px" : "12px 12px 8px" }}>
        {collapsed ? (
          <Link href="/?compose=1" className="bcc-btn-icon" aria-label="New Post" title="New Post"
            style={{ width: 36, height: 36, background: "var(--bcc-accent)", color: "#fff", borderRadius: "var(--bcc-radius-md)", margin: "0 auto", display: "flex" }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </Link>
        ) : (
          <Link href="/?compose=1" className="bcc-btn bcc-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New Post
          </Link>
        )}
      </div>

      {/* ── Scrollable nav region ── */}
      <div className="bcc-sidebar-scroll">

        <nav aria-label="Primary navigation" style={{ padding: "4px 0" }}>
          {PRIMARY_NAV.map(item => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`bcc-nav-item${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                style={collapsed ? iconOnlyItem : undefined}
              >
                <span className="bcc-nav-item-icon">{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Quick links — authed only (viewer-scoped /me/* + settings routes) */}
        {!collapsed && handle !== null && (
          <>
            <div className="bcc-nav-divider" />
            <p className="bcc-nav-section">Quick links</p>
            <nav aria-label="Quick links">
              {QUICK_LINKS.map(item => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href as Route}
                    className={`bcc-nav-item${isActive ? " active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    style={{ fontSize: 12 }}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}

      </div>

      {/* ── Collapse toggle — always pinned at bottom ── */}
      <div className="bcc-sidebar-pin-bottom" style={{ padding: collapsed ? "8px 8px" : "8px 8px" }}>
        <button
          onClick={onToggle}
          className="bcc-btn-icon"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            width: collapsed ? 36 : "100%",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 8,
            padding: collapsed ? "0" : "8px 10px",
            borderRadius: "var(--bcc-radius-md)",
            color: "var(--bcc-text-muted)",
            height: 36,
          }}
        >
          <ChevronIcon collapsed={collapsed} />
          {!collapsed && (
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Collapse
            </span>
          )}
        </button>
      </div>

    </div>
  );
}