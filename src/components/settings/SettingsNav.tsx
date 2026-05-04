"use client";

/**
 * SettingsNav — shared tab strip across /settings/* pages.
 *
 * Lives outside the page-specific server shells so the active tab
 * highlights correctly under client-side route changes. Each entry is
 * a typed Next.js Route — adding a new settings page means adding
 * one row here.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

interface SettingsTab {
  href: Route;
  label: string;
  blurb: string;
}

const TABS: SettingsTab[] = [
  {
    href: "/settings/profile" as Route,
    label: "Profile",
    blurb: "Bio, avatar, cover photo.",
  },
  {
    href: "/settings/identity" as Route,
    label: "Identity",
    blurb: "Handle, display name.",
  },
  {
    href: "/settings/privacy" as Route,
    label: "Privacy",
    blurb: "What's hidden from others.",
  },
  {
    href: "/settings/notifications" as Route,
    label: "Notifications",
    blurb: "Bell + weekly email digest.",
  },
  {
    href: "/settings/messages" as Route,
    label: "Messages",
    blurb: "Who can message you.",
  },
  {
    href: "/settings/blocks" as Route,
    label: "Blocks",
    blurb: "Users you've blocked.",
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Settings sections">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              "bcc-mono inline-flex flex-col items-start gap-0.5 border-2 px-4 py-2 text-[11px] tracking-[0.18em] transition " +
              (active
                ? "border-ink bg-ink text-cardstock"
                : "border-cardstock-edge bg-cardstock-deep/40 text-ink-soft hover:border-ink/50 hover:text-ink")
            }
          >
            <span className="uppercase">{tab.label}</span>
            <span className="text-[9px] tracking-[0.12em] opacity-70 normal-case">
              {tab.blurb}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
