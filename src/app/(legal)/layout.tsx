import Image from "next/image";
import Link from "next/link";

import { LegalTabs } from "@/components/legal/LegalTabs";

/**
 * Legal document layout — a public, single-column reading surface for the
 * Terms / Privacy / Cookie pages. Deliberately outside the app shell (no
 * sidebars, no auth card) so long-form legal text reads cleanly. Public:
 * these routes are not in middleware's protected matcher. Uses the
 * theme-aware --bcc-* tokens (not cardstock/ink) — this is app chrome, not
 * a trading-card face.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bcc-bg)" }}>
      <div
        className="sticky top-0 z-10 border-b border-[var(--bcc-border)]"
        style={{ background: "var(--bcc-surface)" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 pt-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/images/Blue_Collar_Crypto_Logo.png"
              alt="Blue Collar Crypto"
              width={28}
              height={28}
              priority
            />
            <span
              className="bcc-mono text-[var(--bcc-text)]"
              style={{ fontSize: "12px", letterSpacing: "0.2em" }}
            >
              BLUE COLLAR CRYPTO
            </span>
          </Link>
        </div>
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <LegalTabs />
        </div>
      </div>
      {children}
    </div>
  );
}
