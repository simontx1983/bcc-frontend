import { CopyrightMark } from "@/components/layout/CopyrightMark";
import { LEGAL } from "@/lib/legal/config";

/**
 * Shared chrome for the legal documents (Terms / Privacy / Cookies).
 * Renders a consistent title block, readable prose column, and the
 * operator contact line. Content is passed as children (JSX) so each
 * document keeps full control of its structure. Cross-doc navigation and
 * "back to the floor" live in the LegalLayout header now (LegalTabs +
 * the logo, which already links home) — repeating them in every page's
 * footer was redundant.
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
      <header className="border-b border-dashed border-[var(--bcc-border)] pb-8">
        <p
          className="bcc-mono text-[var(--bcc-accent)]"
          style={{ fontSize: "11px", letterSpacing: "0.24em" }}
        >
          LEGAL {"//"} {DOC_LABELS[docKey].toUpperCase()}
        </p>
        <h1 className="bcc-stencil mt-3 text-[var(--bcc-text)]" style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", lineHeight: 1.02 }}>
          {title}
        </h1>
        <p className="font-serif italic text-[var(--bcc-text-secondary)] mt-4" style={{ fontSize: "15px", lineHeight: 1.55 }}>
          {intro}
        </p>
        <p
          className="bcc-mono mt-4 text-[var(--bcc-text-muted)]"
          style={{ fontSize: "11px", letterSpacing: "0.14em" }}
        >
          Effective {LEGAL.effectiveDate} · {LEGAL.brand} is operated by {LEGAL.entity}.
        </p>
      </header>

      <div className="bcc-legal-body mt-10">{children}</div>

      {/* Short, faint, centered rule — separates the contact/questions
          block from the main content with generous breathing room, not
          the full-width dashed rule (that one's reserved for setting the
          copyright sign-off apart below, see the footer's own border). */}
      <div className="mt-20 flex justify-center">
        <div style={{ width: 56, height: 1, background: "var(--bcc-border-light)" }} />
      </div>

      <footer className="mt-10">
        <p
          className="bcc-mono text-[var(--bcc-text-muted)]"
          style={{ fontSize: "11px", letterSpacing: "0.14em" }}
        >
          QUESTIONS
        </p>
        <p className="mt-2 text-[var(--bcc-text-secondary)]" style={{ fontSize: "14px", lineHeight: 1.6 }}>
          Contact us at{" "}
          <a href={`mailto:${LEGAL.legalEmail}`} className="text-[var(--bcc-accent)] underline">
            {LEGAL.legalEmail}
          </a>{" "}
          (legal) or{" "}
          <a href={`mailto:${LEGAL.privacyEmail}`} className="text-[var(--bcc-accent)] underline">
            {LEGAL.privacyEmail}
          </a>{" "}
          (privacy / data requests).
        </p>

        <div className="mt-10 flex justify-center border-t border-dashed border-[var(--bcc-border)] pt-8">
          <CopyrightMark size="lg" />
        </div>
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
      <h2 className="bcc-mono text-[var(--bcc-text)]" style={{ fontSize: "14px", letterSpacing: "0.12em" }}>
        <span className="text-[var(--bcc-accent)]">{String(n).padStart(2, "0")}</span> · {heading.toUpperCase()}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[var(--bcc-text-secondary)]" style={{ fontSize: "14px", lineHeight: 1.7 }}>
      {children}
    </p>
  );
}

export function LegalUL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-2 text-[var(--bcc-text-secondary)]" style={{ fontSize: "14px", lineHeight: 1.65 }}>
      {children}
    </ul>
  );
}
