/**
 * UnderConstructionPage — full-page placeholder for nav routes whose
 * backend or design hasn't landed yet. Companion to <ComingSoonPanel>
 * (which stubs profile tabs).
 *
 * Honest empty-state per §N10: tell the user what's coming and when.
 * Reuses the BCC file-rail + stencil-headline rhythm so a stubbed
 * route still feels like the same product.
 */

interface UnderConstructionPageProps {
  /** File-rail label, e.g. "FLOOR // VALIDATORS". */
  rail: string;
  /** Small orange kicker above the headline, e.g. "VALIDATORS". */
  kicker: string;
  /** Large stencil headline. */
  headline: string;
  /** Body paragraph — what's coming and why it isn't here yet. */
  body: string;
  /** Footer badge — phase or roadmap hint, e.g. "ROADMAP // V1.5". */
  badge: string;
}

export function UnderConstructionPage({
  rail,
  kicker,
  headline,
  body,
  badge,
}: UnderConstructionPageProps) {
  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-12">
      <div className="border-b border-dashed border-cardstock/15 pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>{rail}</span>
        </span>
      </div>

      <header className="mt-10">
        <p className="bcc-mono text-safety">{kicker}</p>
        <h1
          className="bcc-stencil mt-2 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)" }}
        >
          {headline}
        </h1>
        <p className="mt-3 max-w-2xl font-serif leading-relaxed text-cardstock-deep">
          {body}
        </p>
      </header>

      <div className="mt-10 border-t border-dashed border-cardstock/15 pt-6">
        <span
          className="bcc-mono inline-flex items-center gap-2 border-2 border-ink bg-cardstock-deep px-3 py-2 text-ink"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-safety" />
          {badge}
        </span>
      </div>
    </main>
  );
}
