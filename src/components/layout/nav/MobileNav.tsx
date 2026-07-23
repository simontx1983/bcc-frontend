"use client";

import { Globe, Home, LayoutGrid, Menu, Plus } from "lucide-react";
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
        <Home
          size={20}
          strokeWidth={1.7}
          aria-hidden
          fill={isActive("/") ? "var(--bcc-accent)" : "none"}
          fillOpacity={isActive("/") ? 0.15 : 0}
        />
        <span style={labelStyle}>Home</span>
      </Link>

      {/* Directory */}
      <Link href="/directory" style={itemStyle("/directory")}>
        <LayoutGrid size={20} strokeWidth={1.7} aria-hidden />
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
            color: "var(--bcc-white)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px var(--bcc-accent-glow), 0 0 0 3px var(--bcc-bg)",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Plus size={20} strokeWidth={2.2} aria-hidden />
        </NewPostTrigger>
      </div>

      {/* Communities */}
      <Link href="/communities" style={itemStyle("/communities")}>
        <Globe size={20} strokeWidth={1.7} aria-hidden />
        <span style={labelStyle}>Communities</span>
      </Link>

      {/* Menu — opens offcanvas */}
      <button onClick={onMenuOpen} style={itemStyle("__menu__")} aria-label="Open menu">
        <Menu size={20} strokeWidth={1.7} aria-hidden />
        <span style={labelStyle}>Menu</span>
      </button>

    </nav>
  );
}