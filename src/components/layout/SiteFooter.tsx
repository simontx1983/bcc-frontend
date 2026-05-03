/**
 * SiteFooter — global footer slotted under every page.
 *
 * Server component (no state, no effects). Two parts:
 *   1. Site index — caps stencil mirror of the header nav, doubling as a
 *      sitemap. Single source of truth lives in nav-config.ts.
 *   2. Bottom row — dashed-top rule, mono caption with a slightly-rotated
 *      "Member in Good Standing" stamp for warehouse character. Ported
 *      from member-profile-prototype.html (.footer + .footer .stamp).
 *
 * The copyright year uses the server's UTC year. Acceptable for a
 * server-rendered footer that ships static HTML per request.
 */

import type { Route } from "next";
import Link from "next/link";

import { SITE_NAV } from "./nav-config";

const BUILD_LABEL = "V1 · Phase 4";

export function SiteFooter() {
  const year = new Date().getUTCFullYear();

  return (
    <footer>
      <div className="bcc-footer-index">
        <span className="bcc-footer-index-label">SITE INDEX</span>
        {SITE_NAV.map((link) => (
          <Link key={link.href} href={link.href as Route}>
            {link.label}
          </Link>
        ))}
      </div>

      <div className="bcc-footer">
        <span>© {year} Blue Collar Crypto · Signed on-chain · Graded by the floor</span>
        <span className="bcc-footer-stamp">Member in Good Standing</span>
        <span>{BUILD_LABEL} · Built on the Floor</span>
      </div>
    </footer>
  );
}
