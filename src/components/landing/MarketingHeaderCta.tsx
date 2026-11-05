"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The marketing header's primary CTA. /for-validators points at its own search
 * rather than sign-up: an operator we contacted cold should look themselves up
 * before anyone asks them to make an account.
 */
export function MarketingHeaderCta() {
  if (usePathname() === "/for-validators") {
    return (
      <a href="#find" className="bcc-btn bcc-btn-sm bcc-btn-primary">
        Find your validator
      </a>
    );
  }
  return (
    <Link href="/signup" className="bcc-btn bcc-btn-sm bcc-btn-primary">
      Join the Floor
    </Link>
  );
}
