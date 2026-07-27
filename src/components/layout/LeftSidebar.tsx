"use client";

import {
  BadgeCheck,
  ChevronLeft,
  Globe,
  Home,
  LayoutGrid,
  MessageSquare,
  Plus,
  Scale,
  Users,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { NewPostTrigger } from "@/components/composer/NewPostTrigger";
import { EyeIcon } from "@/components/feed/actionIcons";
import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { LEGAL_ROUTES } from "@/lib/legal/config";

// Icons backed by lucide-react (task 5) — Watching reuses the same
// EyeIcon as the feed's "Following" tab (was independently redrawn
// here before); Home/Directory/Communities match MobileNav's copies
// (were byte-identical duplicates, now one import each).
const PRIMARY_NAV = [
  { label: "Home",        href: "/",           icon: <Home size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Members",     href: "/members",     icon: <Users size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Directory",   href: "/directory",   icon: <LayoutGrid size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Communities", href: "/communities", icon: <Globe size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Messages",    href: "/messages",    icon: <MessageSquare size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Disputes",    href: "/disputes",    icon: <Scale size={20} strokeWidth={1.7} aria-hidden /> },
  { label: "Watching",    href: "/watching",    icon: <EyeIcon size={20} /> },
  { label: "Validators",  href: "/validators",  icon: <BadgeCheck size={20} strokeWidth={1.7} aria-hidden /> },
] as const;

const QUICK_LINKS = [
  { label: "My Progression", href: "/me/progression" },
  { label: "My Reliability",  href: "/me/reliability"  },
  { label: "Panel Duty",      href: "/panel"            },
  { label: "Settings",        href: "/u/me?tab=profile" },
] as const;

const LEGAL_LINKS = [
  { label: "Terms",   href: LEGAL_ROUTES.terms },
  { label: "Privacy", href: LEGAL_ROUTES.privacy },
  { label: "Cookies", href: LEGAL_ROUTES.cookies },
] as const;

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <ChevronLeft
      size={16}
      strokeWidth={1.8}
      aria-hidden
      style={{ transition: "transform 200ms ease", transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
    />
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
          <NewPostTrigger className="bcc-btn-icon" ariaLabel="New Post" title="New Post"
            style={{ width: 36, height: 36, background: "var(--bcc-accent)", color: "var(--bcc-white)", borderRadius: "var(--bcc-radius-md)", margin: "0 auto", display: "flex" }}
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden />
          </NewPostTrigger>
        ) : (
          <NewPostTrigger className="bcc-btn bcc-btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            <Plus size={14} strokeWidth={2.2} aria-hidden />
            New Post
          </NewPostTrigger>
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
                data-bcc-tour={item.href === "/watching" ? "nav.watching" : undefined}
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

        {/* Copyright + legal links — always shown, small and faint */}
        {!collapsed && (
          <>
            <div className="bcc-nav-divider" />
            <div style={{ padding: "0 16px 4px" }}>
              <CopyrightMark />
            </div>
            <div style={{ padding: "4px 16px 8px", display: "flex", gap: 12, flexWrap: "wrap" }}>
              {LEGAL_LINKS.map(item => (
                <Link key={item.href} href={item.href} className="bcc-legal-link">
                  {item.label}
                </Link>
              ))}
            </div>
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