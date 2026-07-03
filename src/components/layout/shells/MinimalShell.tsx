import Link from "next/link";

import { LEGAL, LEGAL_ROUTES } from "@/lib/legal/config";

export function MinimalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bcc-minimal-shell">
      {children}
      <footer className="bcc-auth-footer">
        <span>© 2026 {LEGAL.brand}</span>
        <Link href={LEGAL_ROUTES.terms}>Terms of Service</Link>
        <Link href={LEGAL_ROUTES.privacy}>Privacy Policy</Link>
        <Link href={LEGAL_ROUTES.cookies}>Cookie Policy</Link>
      </footer>
    </div>
  );
}
