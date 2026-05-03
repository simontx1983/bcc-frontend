/**
 * ComingSoonPanel — placeholder for tabs whose data layer hasn't
 * landed yet. Honest empty-state per §N10: "tell the user what is
 * happening and what unlocks it."
 *
 * Renders a paper sheet with a stenciled title, an italic line
 * explaining the gap, and a phosphor-tinted footer pointing to the
 * phase that delivers it.
 */

interface ComingSoonPanelProps {
  label: string;
  hint: string;
}

export function ComingSoonPanel({ label, hint }: ComingSoonPanelProps) {
  return (
    <article className="bcc-paper">
      <header className="bcc-paper-head">
        <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
          {label}
        </h3>
        <span className="bcc-mono text-weld" style={{ fontSize: "9px" }}>
          NEXT PHASE
        </span>
      </header>

      <div className="px-8 py-12">
        <div
          className="bcc-mono mb-4 text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          NOT BUILT — YET
        </div>
        <p
          className="font-serif italic text-ink"
          style={{ fontSize: "18px", lineHeight: 1.5, maxWidth: "640px" }}
        >
          {hint}
        </p>
        <div
          className="bcc-mono mt-6 inline-flex items-center gap-2 border-2 border-ink bg-cardstock-deep px-3 py-2 text-ink"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          <span aria-hidden className="h-2 w-2 rounded-full bg-safety" />
          BACKEND CONTRACT FROZEN · UI WAITING
        </div>
      </div>
    </article>
  );
}
