"use client";

/**
 * SectionTabs — the tab strip of a section page whose tabs are ROUTES
 * (Explore ▸ Validators · Projects · Creators, Members ▸ Everyone ·
 * Mentors). Site Structure A, design §10 slot 5.
 *
 * Links, not an ARIA tablist: each tab is its own page with its own URL,
 * so this is navigation (`<nav>` + `aria-current="page"`), the same
 * semantics as LegalTabs. The panel-switching strips (SubTabNav,
 * WatchingTabs) use role="tab" + useRovingTabs instead; don't mix the two.
 *
 * Visuals reuse the existing `.bcc-tab` / `.active` rules in globals.css.
 * `min-h-[44px]` guarantees the tap target the 12px+13px+3px box only
 * just reaches.
 *
 * Active = exact pathname match, so `/explore` is not also active on
 * `/explore/projects`.
 */

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SectionTab {
  label: string;
  href: Route;
}

export function SectionTabs({
  label,
  tabs,
}: {
  /** Accessible name of the strip, e.g. "Explore sections". */
  label: string;
  tabs: readonly SectionTab[];
}) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label={label} className="mx-auto mt-8 max-w-[1560px] px-4 sm:px-7">
      <div className="flex gap-1 overflow-x-auto border-b border-dashed border-bcc-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`bcc-tab min-h-[44px] shrink-0${active ? " active" : ""}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
