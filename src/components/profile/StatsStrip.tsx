/**
 * StatsStrip — six-column platform-tagged stat row that bridges hero
 * and record sections.
 *
 * Each cell shows label · big stencil number · pre-formatted delta line
 * tinted by `delta_tone`. Optional `platform` chip says where the count
 * comes from (PEEPSO, ON-CHAIN, etc.) — important on a federated stack
 * where users want to know which system is the authority.
 *
 * Drops to 3 columns at 1100px and 2 at 600px (matches the prototype's
 * grid breakpoints). Dashed dividers between cells, dashed top + bottom
 * borders to delimit the strip from the surrounding hero.
 */

import type { MemberStat } from "@/lib/api/types";

const TONE_CLASS: Record<NonNullable<MemberStat["delta_tone"]>, string> = {
  phosphor: "text-phosphor",
  dim:      "text-cardstock/45",
  safety:   "text-safety",
  weld:     "text-weld",
};

export function StatsStrip({ stats }: { stats: MemberStat[] }) {
  return (
    <section
      aria-label="Member statistics"
      className="grid grid-cols-2 border-t border-b border-dashed border-cardstock/20 sm:grid-cols-3 lg:grid-cols-6"
    >
      {stats.map((stat, i) => (
        <div
          key={stat.key}
          className="relative px-5 py-5 lg:border-r lg:border-dashed lg:border-cardstock/20"
          style={{
            // Hide the right-divider on the last cell of each row.
            borderRightWidth: i % 6 === 5 ? 0 : undefined,
          }}
        >
          <div className="bcc-mono flex items-center gap-2 text-cardstock/55">
            <span>{stat.label.toUpperCase()}</span>
            {stat.platform !== null && (
              <span
                className="bcc-mono text-safety"
                style={{
                  background: "rgba(240, 90, 40, 0.12)",
                  border: "1px solid rgba(240, 90, 40, 0.3)",
                  padding: "1px 5px",
                  fontSize: "7.5px",
                  letterSpacing: "0.2em",
                }}
              >
                {stat.platform}
              </span>
            )}
          </div>

          <div
            className="bcc-stencil mt-2 flex items-baseline gap-2 text-cardstock"
            style={{
              fontSize: "42px",
              lineHeight: 1,
              letterSpacing: "-0.015em",
              fontFeatureSettings: "'tnum' 1",
            }}
          >
            {stat.value}
            {stat.delta !== null && stat.delta_tone !== null && (
              <small
                className={TONE_CLASS[stat.delta_tone]}
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: "11px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                }}
              >
                {stat.delta}
              </small>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
