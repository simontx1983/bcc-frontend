"use client";

import { useEffect, useRef, useState } from "react";
import { LeftSidebar } from "./LeftSidebar";
import { RightRailOutlet } from "./RightRailOutlet";
import { RightRailProvider } from "./RightRailContext";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

interface AppShellProps {
  children: React.ReactNode;
  hideRightSidebar?: boolean;
  hideLeftSidebar?: boolean;
}

export function AppShell({
  children,
  hideRightSidebar = false,
  hideLeftSidebar = false,
}: AppShellProps) {
  const centerRef = useRef<HTMLElement>(null);
  const glowRef   = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  // The feed scrolls inside this center column, not the window, so Next's
  // scroll restoration can't reach it — remember + restore per route so
  // Back from a post lands where you were. See useScrollRestoration.
  useScrollRestoration(centerRef);

  useEffect(() => {
    if (window.innerWidth < 1280) {
      setCollapsed(true);
    } else {
      setCollapsed(localStorage.getItem("bcc-sidebar-collapsed") === "true");
    }

    const handleResize = () => {
      if (window.innerWidth < 1280) {
        setCollapsed(true);
      } else {
        setCollapsed(localStorage.getItem("bcc-sidebar-collapsed") === "true");
      }
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handleToggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (window.innerWidth >= 1280) {
      localStorage.setItem("bcc-sidebar-collapsed", String(next));
    }
  }

  // Cursor glow
  useEffect(() => {
    const center = centerRef.current;
    const glow   = glowRef.current;
    if (!center || !glow) return;

    function onMouseMove(e: MouseEvent) {
      const rect = center!.getBoundingClientRect();
      glow!.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
    }
    function onMouseEnter() { glow!.style.opacity = "1"; }
    function onMouseLeave() { glow!.style.opacity = "0"; }

    center.addEventListener("mousemove",  onMouseMove,  { passive: true });
    center.addEventListener("mouseenter", onMouseEnter, { passive: true });
    center.addEventListener("mouseleave", onMouseLeave, { passive: true });
    return () => {
      center.removeEventListener("mousemove",  onMouseMove);
      center.removeEventListener("mouseenter", onMouseEnter);
      center.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  return (
    <RightRailProvider>
    <div className="bcc-app-shell">
      <div className="bcc-body">

        {!hideLeftSidebar && (
          <aside
            className="bcc-col bcc-col-left"
            style={{ width: collapsed ? 64 : "var(--bcc-sidebar-left-w)" }}
          >
            <LeftSidebar collapsed={collapsed} onToggle={handleToggle} />
          </aside>
        )}

        <main ref={centerRef} className="bcc-col bcc-col-center" style={{ position: "relative" }}>
          <div
            ref={glowRef}
            aria-hidden
            style={{
              position: "absolute", top: 0, left: 0,
              width: 600, height: 600, borderRadius: "50%",
              background: "radial-gradient(circle, var(--bcc-accent-glow) 0%, transparent 65%)",
              transform: "translate(-9999px, -9999px)",
              pointerEvents: "none", opacity: 0,
              transition: "opacity 300ms ease",
              marginLeft: -300, marginTop: -300,
              zIndex: 0, willChange: "transform",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
        </main>

        {!hideRightSidebar && (
          <aside className="bcc-col bcc-col-right">
            <RightRailOutlet />
          </aside>
        )}

      </div>
    </div>
    </RightRailProvider>
  );
}