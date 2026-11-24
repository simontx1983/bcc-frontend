"use client";

import { Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

import { NewPostTrigger } from "@/components/composer/NewPostTrigger";
import { NavIcon, phoneBarFor } from "@/components/layout/nav-items";

interface MobileNavProps {
  onMenuOpen?: () => void;
}

/**
 * The phone bar. Its slots come from nav-items (phoneBarFor): signed in,
 * Home · Explore · ＋ · Communities · Menu; a guest, who can't post, gets
 * Members in the ＋ slot. Everything else is in the Menu (MainOffcanvas).
 */
export function MobileNav({ onMenuOpen }: MobileNavProps) {
  const pathname = usePathname() ?? "/";
  // Same signed-in test as LeftSidebar: the session is seeded server-side,
  // so this is settled on the first render.
  const { data: session } = useSession();
  const signedIn = session !== null && session !== undefined;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // `alignSelf: stretch` makes each item span the bar's full height (its
  // content stays centred), so the active mark can sit on the top edge.
  const itemStyle = (href: string): React.CSSProperties => ({
    position: "relative",
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 3,
    padding: "6px 0",
    color: isActive(href) ? "var(--bcc-text)" : "var(--bcc-text-secondary)",
    textDecoration: "none",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    transition: "color var(--bcc-transition-fast)",
    WebkitTapHighlightColor: "transparent",
  });

  // Non-colour active cue (#74): a 3px bar on the item's top edge, so the
  // active destination is not signalled by text brightness alone. Drawn
  // on --bcc-accent-indicator (selection geometry; ≥3:1 on the bar in
  // both themes), the same token as .bcc-nav-item.active's side bar.
  const activeMark = (href: string) =>
    isActive(href) ? (
      <span
        aria-hidden
        data-testid="mobile-nav-active-mark"
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 24,
          height: 3,
          borderRadius: "0 0 3px 3px",
          background: "var(--bcc-accent-indicator)",
        }}
      />
    ) : null;

  const current = (href: string) => (isActive(href) ? ("page" as const) : undefined);

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
        // F-355: grow by the home-indicator inset and pad it out, so the
        // icons sit above the indicator on notched iPhones. env() is 0
        // everywhere else (and needs viewport-fit=cover, set in layout).
        height: "var(--bcc-mobile-nav-total-h)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        // Landscape notch: keep the items off the side insets too.
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        display: "flex",
        alignItems: "center",
        zIndex: 200,
        borderTop: "1px solid var(--bcc-border)",
        // Solid page-ground bar (dev note 33): the feed scrolls underneath
        // it, so a translucent glass bar let post text show through.
        background: "var(--bcc-bg)",
      }}
    >
      {phoneBarFor(signedIn).map((slot) => {
        if (slot.kind === "post") {
          return (
            <div key="post" style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", position: "relative" }}>
              <NewPostTrigger
                ariaLabel="New Post"
                style={{
                  position: "absolute",
                  bottom: -16,
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "var(--bcc-accent)",
                  color: "var(--bcc-on-accent)",
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
          );
        }

        if (slot.kind === "menu") {
          // Opens the offcanvas Menu.
          return (
            <button key="menu" onClick={onMenuOpen} style={itemStyle("__menu__")} aria-label="Open menu">
              <Menu size={20} strokeWidth={1.7} aria-hidden />
              <span style={labelStyle}>Menu</span>
            </button>
          );
        }

        const { item } = slot;
        return (
          <Link key={item.href} href={item.href} style={itemStyle(item.href)} aria-current={current(item.href)}>
            {activeMark(item.href)}
            {/* Home fills on its active state, as it always has. */}
            <NavIcon Icon={item.Icon} filled={item.href === "/" && isActive("/")} />
            <span style={labelStyle}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
