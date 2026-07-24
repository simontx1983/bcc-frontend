"use client";

/**
 * SettingsNav — integrated tab strip rendered inside the persistent
 * hero panel (see app/settings/layout.tsx).
 *
 * Underline-style active marker on the panel surface: accent
 * line under the active tab, secondary text on inactive tabs. Same
 * pattern that GitHub / LinkedIn profile pages use — the tabs feel like
 * part of the hero chrome rather than a separate nav strip.
 *
 * Only used inside SettingsLayout. The /settings/* layout wraps every
 * settings page so the hero (cover + avatar) and this nav persist
 * across navigation — just the content area below changes.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

interface SettingsTab {
  href: Route;
  label: string;
}

// "Profile" is intentionally absent: profile editing (avatar/cover,
// handle, profile fields) moved to the owner-only "My Profile" tab on
// /u/[handle], and /settings/profile now just redirects there. Listing
// it here would bounce the operator out of the settings shell mid-nav.
const TABS: SettingsTab[] = [
  { href: "/settings/privacy"       as Route, label: "Privacy" },
  { href: "/settings/notifications" as Route, label: "Notifications" },
  { href: "/settings/messages"      as Route, label: "Messages" },
  { href: "/settings/communities"   as Route, label: "Communities" },
  { href: "/settings/nft-showcase"  as Route, label: "Showcase" },
  { href: "/settings/account"       as Route, label: "Account" },
  { href: "/settings/blocks"        as Route, label: "Blocks" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap items-end gap-1 overflow-x-auto border-t border-bcc-border px-4 md:px-6"
      aria-label="Settings sections"
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              "bcc-mono relative whitespace-nowrap px-3 py-3 text-[11px] uppercase tracking-[0.18em] transition " +
              (active
                ? "text-bcc-text after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-bcc-accent after:content-['']"
                : "text-bcc-text-secondary hover:text-bcc-text hover:after:absolute hover:after:inset-x-3 hover:after:bottom-0 hover:after:h-[2px] hover:after:bg-bcc-border-strong hover:after:content-['']")
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
