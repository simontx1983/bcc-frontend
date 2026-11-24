"use client";

import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Fragment } from "react";

import { NewPostTrigger } from "@/components/composer/NewPostTrigger";
import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { LEGAL_LINKS, NavIcon, navGroupsFor } from "@/components/layout/nav-items";

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
  const signedIn = session !== null && session !== undefined;

  const iconOnlyItem: React.CSSProperties = {
    justifyContent: "center",
    padding: "10px 0",
    margin: "2px auto",
    width: 40,
  };

  return (
    <div className="bcc-sidebar-content" style={{ padding: 0 }}>

      {/* ── Compose button — members only: a guest can't post ── */}
      {signedIn && (
        <div className="bcc-sidebar-pin-top" style={{ padding: collapsed ? "12px 8px 8px" : "12px 12px 8px" }}>
          {collapsed ? (
            <NewPostTrigger className="bcc-btn-icon" ariaLabel="New Post" title="New Post"
              style={{ width: 36, height: 36, background: "var(--bcc-accent)", color: "var(--bcc-on-accent)", borderRadius: "var(--bcc-radius-md)", margin: "0 auto", display: "flex" }}
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
      )}

      {/* ── Scrollable nav region ── */}
      <div className="bcc-sidebar-scroll">

        {/* The sections, then (signed in) the viewer's own pages, split
            by a dashed rule. One landmark for both groups. */}
        <nav aria-label="Primary navigation" style={{ padding: "4px 0" }}>
          {navGroupsFor(signedIn).map((group, g) => (
            <Fragment key={group[0]?.href ?? g}>
              {g > 0 && <hr className="mx-4 my-2 border-0 border-t border-dashed border-bcc-border" />}
              {group.map(item => {
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
                    {/* The tour target sits on this inner span, not the Link
                        itself — .bcc-nav-item is a full-width flex row, so a
                        selector on the Link spotlighted the whole row width
                        instead of hugging the icon+label content. */}
                    <span
                      data-bcc-tour={item.href === "/watching" ? "nav.watching" : undefined}
                      style={{ display: "inline-flex", alignItems: "center", gap: 12 }}
                    >
                      <span className="bcc-nav-item-icon"><NavIcon Icon={item.Icon} /></span>
                      {!collapsed && item.label}
                    </span>
                    {/* The space keeps the accessible name "Explore pages",
                        not "Explorepages"; the flex row doesn't draw it. */}
                    {!collapsed && item.sub !== null && (
                      <>
                        {" "}
                        <span className="bcc-mono ml-auto text-[10px] font-normal normal-case tracking-[0.08em] text-bcc-text-secondary">
                          {item.sub}
                        </span>
                      </>
                    )}
                  </Link>
                );
              })}
            </Fragment>
          ))}
        </nav>

        {/* Guests: the way in. The header carries the same pair at every
            width, so the icon rail leaves them out rather than squeeze. */}
        {!signedIn && !collapsed && (
          <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <Link href="/signup" className="bcc-btn bcc-btn-primary min-h-[44px] w-full">
              Join the Floor
            </Link>
            <Link href="/login" className="bcc-btn bcc-btn-ghost min-h-[44px] w-full">
              Sign in
            </Link>
          </div>
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
