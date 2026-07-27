"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { LEGAL_ROUTES } from "@/lib/legal/config";

/**
 * `.bcc-auth-footer` is `position: fixed; bottom: 0` (see globals.css) so
 * it's always painted over the bottom of the viewport regardless of
 * scroll position — fine for short pages (login/signup), but a long
 * page (the onboarding wizard) can scroll its own content right up
 * against that fixed strip with no real "end of page" separation.
 *
 * The sentinel below sits in normal document flow right after
 * `children` — i.e. exactly where the footer would sit if it weren't
 * fixed. Observing IT (not the fixed footer itself, which is always
 * "in the viewport" by definition) tells us when the visitor has
 * actually scrolled to the true end of the page content, at which
 * point the footer un-blurs. Short pages satisfy this almost
 * immediately (the sentinel starts near-visible), so behavior there is
 * unchanged; only long content gets the blurred-until-reached effect.
 */
export function MinimalShell({ children }: { children: React.ReactNode }) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [footerRevealed, setFooterRevealed] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setFooterRevealed(entry?.isIntersecting ?? false),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="bcc-minimal-shell">
      {children}
      <div ref={sentinelRef} aria-hidden className="bcc-auth-footer-sentinel" />
      <footer className={`bcc-auth-footer${footerRevealed ? " is-revealed" : ""}`}>
        <CopyrightMark />
        <nav className="bcc-auth-footer-links" aria-label="Legal">
          <Link href={LEGAL_ROUTES.terms}>Terms</Link>
          <Link href={LEGAL_ROUTES.privacy}>Privacy</Link>
          <Link href={LEGAL_ROUTES.cookies}>Cookies</Link>
        </nav>
      </footer>
    </div>
  );
}
