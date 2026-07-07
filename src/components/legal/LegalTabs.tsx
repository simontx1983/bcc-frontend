"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LEGAL_ROUTES } from "@/lib/legal/config";

const TABS = [
  { label: "Terms",   href: LEGAL_ROUTES.terms },
  { label: "Privacy", href: LEGAL_ROUTES.privacy },
  { label: "Cookies", href: LEGAL_ROUTES.cookies },
] as const;

/** Cross-doc tab strip for the legal pages — lets a reader switch between
 * Terms / Privacy / Cookies without scrolling to the footer cross-links. */
export function LegalTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Legal documents" className="flex gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="bcc-mono rounded-full px-3 py-1.5 transition"
            style={{
              fontSize: "11px",
              letterSpacing: "0.14em",
              background: active ? "var(--bcc-accent-subtle)" : "transparent",
              color: active ? "var(--bcc-accent)" : "var(--bcc-text-secondary)",
            }}
          >
            {tab.label.toUpperCase()}
          </Link>
        );
      })}
    </nav>
  );
}
