import Link from "next/link";

import { LEGAL, LEGAL_ROUTES } from "@/lib/legal/config";

/**
 * Slim legal footer for the main app. Rendered at the bottom of the
 * center column so it's reachable at the end of page content. The auth
 * surfaces have their own footer (MinimalShell).
 */
export function SiteLegalFooter() {
  const linkClass = "bcc-mono text-cardstock-deep hover:text-cardstock transition";
  const linkStyle = { fontSize: "11px", letterSpacing: "0.16em" } as const;

  return (
    <footer className="mt-16 border-t border-dashed border-cardstock/15 px-1 py-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="bcc-mono text-cardstock-deep" style={linkStyle}>
          © 2026 {LEGAL.brand.toUpperCase()}
        </span>
        <Link href={LEGAL_ROUTES.terms} className={linkClass} style={linkStyle}>
          TERMS
        </Link>
        <Link href={LEGAL_ROUTES.privacy} className={linkClass} style={linkStyle}>
          PRIVACY
        </Link>
        <Link href={LEGAL_ROUTES.cookies} className={linkClass} style={linkStyle}>
          COOKIES
        </Link>
      </div>
    </footer>
  );
}
