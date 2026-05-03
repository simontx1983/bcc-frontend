/**
 * ShiftLog — 52-week activity grid in the GitHub-contribution-graph
 * tradition, but rendered with cardstock-deep base + safety-orange
 * heat tints + a black "furnace" topper at the highest level.
 *
 * Rendering rules:
 *   - Server pre-buckets every day into level 0–4. Component renders
 *     `data-level` only; the CSS in globals.css decides the swatch.
 *   - Tooltip text is server-supplied (already-formatted date + count)
 *   - Days are laid out column-major: each column is a week (Sun→Sat)
 *
 * Sits inside the "Record" record-card on the profile, paired with the
 * activity breakdown sidebar.
 */

import type { MemberActivityBreakdown, ShiftLogDay } from "@/lib/api/types";

interface ShiftLogProps {
  days: ShiftLogDay[];
  monthTicks: string[];
  summary: string;
  breakdown: MemberActivityBreakdown[];
}

const TONE_CLASS: Record<MemberActivityBreakdown["tone"], string> = {
  safety:   "bg-safety text-ink",
  weld:     "bg-weld text-ink",
  ink:      "bg-ink text-weld",
  verified: "bg-verified text-white border-ink",
};

export function ShiftLog({ days, monthTicks, summary, breakdown }: ShiftLogProps) {
  // Chunk 364 days → 52 weeks of 7. The mock guarantees this length;
  // production endpoint pads short ranges with level-0 cells.
  const weeks: ShiftLogDay[][] = [];
  for (let w = 0; w < 52; w += 1) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  return (
    <section className="bcc-stage-reveal grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]" style={{ ["--stagger" as string]: "440ms" }}>
      {/* The Record — shift log */}
      <article className="bcc-paper">
        <header className="bcc-paper-head">
          <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
            The Record · Shift Log
          </h3>
          <span className="bcc-mono text-weld" style={{ fontSize: "9px" }}>
            {summary.toUpperCase()}
          </span>
        </header>

        <div className="px-6 py-5">
          {/* Grid: day-axis on the left, weeks across. */}
          <div className="grid grid-cols-[24px_1fr] gap-[6px]">
            {/* Days axis (Mon/Wed/Fri) */}
            <div
              className="grid grid-rows-7 pt-[14px]"
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "8px",
                letterSpacing: "0.16em",
                color: "var(--ink-ghost)",
                textTransform: "uppercase",
              }}
            >
              <span></span>
              <span>MON</span>
              <span></span>
              <span>WED</span>
              <span></span>
              <span>FRI</span>
              <span></span>
            </div>

            <div className="grid grid-rows-[12px_1fr] gap-[3px]">
              {/* Month-tick row across the top. */}
              <div
                className="grid grid-flow-col text-center"
                style={{
                  gridAutoColumns: "minmax(0, 1fr)",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: "8px",
                  letterSpacing: "0.16em",
                  color: "var(--ink-ghost)",
                  textTransform: "uppercase",
                }}
              >
                {monthTicks.map((tick, i) => (
                  <span key={i}>{tick}</span>
                ))}
              </div>

              {/* Weeks grid */}
              <div className="grid grid-flow-col gap-[2px]" style={{ gridAutoColumns: "minmax(0, 1fr)" }}>
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-rows-7 gap-[2px]">
                    {Array.from({ length: 7 }).map((_, di) => {
                      const day = week[di];
                      if (!day) {
                        return <span key={di} className="bcc-shift-day" data-level={0} aria-hidden />;
                      }
                      return (
                        <span
                          key={di}
                          className="bcc-shift-day"
                          data-level={day.level}
                          title={day.tooltip}
                          aria-label={day.tooltip}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend — same five swatches as the cells. */}
          <div
            className="mt-4 flex flex-wrap items-center gap-4"
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: "9px",
              letterSpacing: "0.14em",
              color: "var(--ink-soft)",
              textTransform: "uppercase",
            }}
          >
            <span>LESS</span>
            <span className="bcc-shift-day" data-level={0} style={{ width: 10, height: 10 }} aria-hidden />
            <span className="bcc-shift-day" data-level={1} style={{ width: 10, height: 10 }} aria-hidden />
            <span className="bcc-shift-day" data-level={2} style={{ width: 10, height: 10 }} aria-hidden />
            <span className="bcc-shift-day" data-level={3} style={{ width: 10, height: 10 }} aria-hidden />
            <span className="bcc-shift-day" data-level={4} style={{ width: 10, height: 10 }} aria-hidden />
            <span>MORE · FURNACE AT FULL</span>
          </div>
        </div>
      </article>

      {/* Activity breakdown — paired sidebar */}
      <article className="bcc-paper">
        <header className="bcc-paper-head">
          <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
            Breakdown
          </h3>
          <span className="bcc-mono text-weld" style={{ fontSize: "9px" }}>
            BY ACTIVITY TYPE
          </span>
        </header>

        <ul className="px-5 py-2">
          {breakdown.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-dotted border-ink/20 py-2 last:border-b-0"
            >
              <span
                className={`${TONE_CLASS[row.tone]} flex h-9 w-9 items-center justify-center border-2 border-ink`}
              >
                <BreakdownIcon kind={row.key} />
              </span>
              <div>
                <div className="bcc-stencil text-ink" style={{ fontSize: "14px", letterSpacing: "0.04em", lineHeight: 1.1 }}>
                  {row.label}
                </div>
                <div className="font-serif italic text-ink-soft" style={{ fontSize: "11px", marginTop: "2px" }}>
                  {row.description}
                </div>
              </div>
              <div className="text-right">
                <div className="bcc-stencil text-ink" style={{ fontSize: "24px", lineHeight: 1, fontFeatureSettings: "'tnum' 1" }}>
                  {row.count}
                </div>
                {row.delta_label !== null && (
                  <div
                    className="text-verified"
                    style={{
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: "8.5px",
                      letterSpacing: "0.1em",
                      marginTop: "2px",
                      fontWeight: 500,
                    }}
                  >
                    {row.delta_label}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </article>
    </section>
  );
}

// ─── Tiny SVG icons — line-art only, single stroke, blue-collar feel ──
function BreakdownIcon({ kind }: { kind: MemberActivityBreakdown["key"] }) {
  const common = { width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "pulls":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M8 3v6l4-3 4 3V3" />
        </svg>
      );
    case "reviews":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-hidden>
          <path d="M3 5h14M3 10h18M3 15h12" />
          <path d="M18 16l3 3-3 3" />
        </svg>
      );
    case "reactions":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z" />
        </svg>
      );
    case "disputes":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-hidden>
          <path d="M12 2l9 16H3z" />
          <path d="M12 9v5M12 17v.5" />
        </svg>
      );
    case "posts":
      return (
        <svg {...common} viewBox="0 0 24 24" aria-hidden>
          <path d="M4 4h16v12H6l-2 4z" />
        </svg>
      );
  }
}
