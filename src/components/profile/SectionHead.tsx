/**
 * SectionHead — recurring stencil header used between profile sections.
 * Title on the left, safety-orange flex rule, optional counter on the
 * right. Pulled from the prototype's .section-head pattern.
 */

interface SectionHeadProps {
  title: string;
  counter?: string;
  /** Optional italic deck/sub line under the rule. */
  deck?: string;
}

export function SectionHead({ title, counter, deck }: SectionHeadProps) {
  return (
    <header className="mt-14 flex items-baseline gap-5">
      <h2
        className="bcc-stencil text-cardstock"
        style={{
          fontSize: "clamp(32px, 4vw, 56px)",
          lineHeight: 0.92,
          letterSpacing: "-0.015em",
        }}
      >
        {title}
      </h2>
      <span aria-hidden className="bcc-section-rule" />
      {counter !== undefined && (
        <span
          className="bcc-mono text-weld"
          style={{ fontSize: "11px", letterSpacing: "0.24em" }}
        >
          {counter}
        </span>
      )}
      {deck !== undefined && (
        <p
          className="font-serif italic text-cardstock/70"
          style={{ fontSize: "15px" }}
        >
          {deck}
        </p>
      )}
    </header>
  );
}
