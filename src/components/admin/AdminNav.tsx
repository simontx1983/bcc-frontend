"use client";

/**
 * AdminNav — the section nav shown on the `/admin/*` screens.
 *
 * Links only to routes that exist. Like the avatar-menu entries, it has
 * no capability gate: every admin route answers a non-admin with the
 * "Admin access required" panel, and the API owns the check.
 *
 * Rows use the shared `.bcc-nav-item`, which keys its current state on
 * `aria-current="page"` (tint + indicator bar, full-strength text).
 */

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId } from "react";

const ADMIN_NAV_ITEMS: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/admin/moderation" as Route, label: "Moderation" },
  { href: "/admin/validators" as Route, label: "Validator Directory" },
  { href: "/admin/validators/history" as Route, label: "Validator Audit History" },
];

export function AdminNav() {
  const pathname = usePathname() ?? "";
  const headingId = useId();

  return (
    <nav aria-labelledby={headingId} className="mt-8">
      <h2
        id={headingId}
        className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary"
      >
        BCC ADMINISTRATION
      </h2>
      <ul className="mt-2 flex flex-wrap gap-1 border-b border-bcc-border pb-2">
        {ADMIN_NAV_ITEMS.map((item) => {
          const current = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className="bcc-nav-item m-0 min-h-[44px] w-auto"
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
