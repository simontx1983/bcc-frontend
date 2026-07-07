import Link from "next/link";

import { LEGAL, LEGAL_ROUTES } from "@/lib/legal/config";

export function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bcc-minimal-shell">
      {children}
      <footer className="bcc-auth-footer">
        <span className="bcc-auth-copyright">
          <span className="bcc-auth-copyright-year">© 2026</span>{" "}
          <span className="bcc-auth-copyright-brand">{LEGAL.brand}</span>
        </span>
        <nav className="bcc-auth-footer-links" aria-label="Legal">
          <Link href={LEGAL_ROUTES.terms}>Terms</Link>
          <Link href={LEGAL_ROUTES.privacy}>Privacy</Link>
          <Link href={LEGAL_ROUTES.cookies}>Cookies</Link>
        </nav>
      </footer>
    </div>
  );
}
