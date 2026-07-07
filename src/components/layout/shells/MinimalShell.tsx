import Link from "next/link";

import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { LEGAL_ROUTES } from "@/lib/legal/config";

export function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bcc-minimal-shell">
      {children}
      <footer className="bcc-auth-footer">
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
