import Image from "next/image";
import Link from "next/link";

/**
 * Legal document layout — a public, single-column reading surface for the
 * Terms / Privacy / Cookie pages. Deliberately outside the app shell (no
 * sidebars, no auth card) so long-form legal text reads cleanly. Public:
 * these routes are not in middleware's protected matcher.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cardstock-deep">
      <div className="border-b border-dashed border-cardstock/15">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image
              src="/images/Blue_Collar_Crypto_Logo.png"
              alt="Blue Collar Crypto"
              width={28}
              height={28}
              priority
            />
            <span
              className="bcc-mono text-cardstock"
              style={{ fontSize: "12px", letterSpacing: "0.2em" }}
            >
              BLUE COLLAR CRYPTO
            </span>
          </Link>
        </div>
      </div>
      {children}
    </div>
  );
}
