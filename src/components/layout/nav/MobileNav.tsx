"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NewPostTrigger } from "@/components/composer/NewPostTrigger";

interface MobileNavProps {
  onMenuOpen?: () => void;
}

export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname() ?? "/";

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const itemStyle = (href: string): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 3,
    padding: "6px 0",
    color: isActive(href) ? "var(--bcc-accent)" : "var(--bcc-text-muted)",
    textDecoration: "none",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    transition: "color var(--bcc-transition-fast)",
    WebkitTapHighlightColor: "transparent",
  });

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace",
    fontSize: 9,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    lineHeight: 1,
  };

  return (
    <nav
      aria-label="Mobile navigation"
      className="bcc-mobile-nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height: "var(--bcc-mobile-nav-h)",
        display: "flex",
        alignItems: "center",
        zIndex: 200,
        borderTop: "1px solid var(--bcc-border)",
        background: "var(--bcc-header-bg)",
        backdropFilter: "var(--bcc-blur-md-saturate)",
        WebkitBackdropFilter: "var(--bcc-blur-md-saturate)",
      }}
    >
      {/* Home */}
      <Link href="/" style={itemStyle("/")}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"
            stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
            fill={isActive("/") ? "var(--bcc-accent)" : "none"}
            fillOpacity={isActive("/") ? 0.15 : 0}
          />
          <path d="M7.5 18v-5h5v5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
        </svg>
        <span style={labelStyle}>Home</span>
      </Link>

      {/* Directory */}
      <Link href="/directory" style={itemStyle("/directory")}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <rect x="2" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
          <rect x="11" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
          <rect x="2" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
          <rect x="11" y="12" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
        <span style={labelStyle}>Directory</span>
      </Link>

      {/* Center Post button */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
        <NewPostTrigger
          ariaLabel="New Post"
          style={{
            position: "absolute",
            bottom: -16,
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--bcc-accent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px var(--bcc-accent-glow), 0 0 0 3px var(--bcc-bg)",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        </NewPostTrigger>
      </div>

      {/* Communities */}
      <Link href="/communities" style={itemStyle("/communities")}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6"/>
          <ellipse cx="10" cy="10" rx="3.5" ry="7.5" stroke="currentColor" strokeWidth="1.6"/>
          <path d="M2.5 10h15" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
        <span style={labelStyle}>Communities</span>
      </Link>

      {/* Menu — opens offcanvas */}
      <button onClick={onMenuOpen} style={itemStyle("__menu__")} aria-label="Open menu">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <span style={labelStyle}>Menu</span>
      </button>

    </nav>
  );
}