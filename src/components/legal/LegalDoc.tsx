import Link from "next/link";

import { LEGAL, LEGAL_ROUTES } from "@/lib/legal/config";

/**
 * Shared chrome for the legal documents (Terms / Privacy / Cookies).
 * Renders a consistent title block, readable prose column, cross-links to
 * the sibling documents, and the operator contact line. Content is passed
 * as children (JSX) so each document keeps full control of its structure.
 */

type LegalKey = "terms" | "privacy" | "cookies";

const DOC_LABELS: Record<LegalKey, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  cookies: "Cookie Policy",
};

export function LegalDoc({
  docKey,
  title,
  intro,
  children,
}: {
  docKey: LegalKey;
  title: string;
  /** One-line summary under the title. */
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header className="border-b border-dashed border-cardstock/20 pb-8">
        <p
          className="bcc-mono text-safety"
          style={{ fontSize: "11px", letterSpacing: "0.24em" }}
        >
          LEGAL {"//"} {DOC_LABELS[docKey].toUpperCase()}
        </p>
        <h1 className="bcc-stencil mt-3 text-cardstock" style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", lineHeight: 1.02 }}>
          {title}
        </h1>
        <p className="font-serif italic text-ink-soft mt-4" style={{ fontSize: "15px", lineHeight: 1.55 }}>
          {intro}
        </p>
        <p
          className="bcc-mono mt-4 text-cardstock-deep"
          style={{ fontSize: "11px", letterSpacing: "0.14em" }}
        >
          Effective {LEGAL.effectiveDate} · {LEGAL.brand} is operated by {LEGAL.entity}.
        </p>
      </header>

      <div className="bcc-legal-body mt-10">{children}</div>

      <footer className="mt-14 border-t border-dashed border-cardstock/20 pt-8">
        <p
          className="bcc-mono text-cardstock-deep"
          style={{ fontSize: "11px", letterSpacing: "0.14em" }}
        >
          QUESTIONS
        </p>
        <p className="mt-2 text-ink-soft" style={{ fontSize: "14px", lineHeight: 1.6 }}>
          Contact us at{" "}
          <a href={`mailto:${LEGAL.legalEmail}`} className="text-safety underline">
            {LEGAL.legalEmail}
          </a>{" "}
          (legal) or{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-safety underline">
            {LEGAL.privacyEmail}
          </a>{" "}
          (privacy / data requests).
        </p>

        <nav className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
          {(Object.keys(DOC_LABELS) as LegalKey[]).map((key) => (
            <Link
              key={key}
              href={LEGAL_ROUTES[key]}
              aria-current={key === docKey ? "page" : undefined}
              className={`bcc-mono ${key === docKey ? "text-cardstock" : "text-cardstock-deep hover:text-cardstock"}`}
              style={{ fontSize: "11px", letterSpacing: "0.18em" }}
            >
              {DOC_LABELS[key].toUpperCase()}
            </Link>
          ))}
          <Link
            href="/"
            className="bcc-mono text-cardstock-deep hover:text-cardstock"
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            ← BACK TO THE FLOOR
          </Link>
        </nav>
      </footer>
    </article>
  );
}

/**
 * A numbered legal section. Renders an anchored h2 and its body. Keep
 * paragraphs as <p className="legal-p"> and lists as <ul className="legal-ul">
 * via the LegalP / LegalUL helpers for consistent spacing.
 */
export function LegalSection({
  n,
  heading,
  children,
}: {
  n: number;
  heading: string;
  children: React.ReactNode;
}) {
  const id = `s${n}`;
  return (
    <section id={id} className="mb-9 scroll-mt-24">
      <h2 className="bcc-mono text-cardstock" style={{ fontSize: "14px", letterSpacing: "0.12em" }}>
        <span className="text-safety">{String(n).padStart(2, "0")}</span> · {heading.toUpperCase()}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ink-soft" style={{ fontSize: "14px", lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

export function LegalUL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-2 text-ink-soft" style={{ fontSize: "14px", lineHeight: 1.65 }}>
      {children}
    </ul>
  );
}
