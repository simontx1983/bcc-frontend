/**
 * GoodStandingRibbon — diagonal verified-green caution-tape banner
 * with a black inset bar of phosphor-green stencil text.
 *
 * Renders only when the server reports `is_in_good_standing: true`.
 * Server-supplied facts (max ~3) sit on the right; rendering decisions
 * (which facts to surface) are NOT made here.
 */

import type { MemberStanding } from "@/lib/api/types";

export function GoodStandingRibbon({ standing }: { standing: MemberStanding }) {
  if (!standing.is_in_good_standing) return null;

  return (
    <div className="bcc-standing bcc-stage-reveal" style={{ ["--stagger" as string]: "60ms" }}>
      <div className="mx-auto max-w-[1560px] px-7">
        <div className="bcc-standing-inner">
          <div className="flex flex-wrap items-center gap-3">
            <span className="bcc-seal-check" aria-hidden>✓</span>
            <span>Member in Good Standing</span>
            <span
              aria-hidden
              className="inline-block h-[6px] w-[6px] rounded-full bg-phosphor"
            />
            <span className="bcc-mono text-weld" style={{ fontWeight: 400 }}>
              {standing.since_label.toUpperCase()}
            </span>
          </div>
          <div className="bcc-mono flex flex-wrap items-center gap-x-5 gap-y-2 text-weld" style={{ fontWeight: 400 }}>
            {standing.facts.map((fact, i) => (
              <span key={fact} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-phosphor" />}
                {fact}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
