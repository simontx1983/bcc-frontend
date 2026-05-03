/**
 * LiveShift — the green-phosphor "what they're doing right now" column.
 *
 * Mimics a CRT terminal readout: phosphor-green title with a pulsing
 * dot, dotted dividers between rows, mono caption type. Server feeds
 * pre-rendered short-form labels per §A2 (no ellipsis logic on the
 * client, no "x minutes ago" math).
 *
 * In production this is a candidate for SSE-driven updates (same source
 * as Phase 3's LiveSignals ticker, scoped to the profile owner).
 */

import type { MemberLiveShiftEvent } from "@/lib/api/types";

export function LiveShift({ events }: { events: MemberLiveShiftEvent[] }) {
  return (
    <aside
      aria-label="Recent activity (live)"
      className="bcc-stage-reveal w-full md:w-[260px]"
      style={{
        background: "var(--concrete-low, #0b0907)",
        border: "1px solid rgba(125, 255, 154, 0.25)",
        padding: "14px 16px",
        ["--stagger" as string]: "240ms",
      }}
    >
      <header className="bcc-phosphor-text bcc-stencil flex items-center justify-between border-b border-dashed border-phosphor/30 pb-2"
        style={{ fontSize: "13px", letterSpacing: "0.2em" }}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden className="bcc-phosphor-dot" />
          LIVE SHIFT
        </span>
        <span className="bcc-mono text-cardstock/45" style={{ fontSize: "9px" }}>
          {events.length} EVTS
        </span>
      </header>

      <ol className="mt-2 space-y-0">
        {events.map((event) => (
          <li
            key={event.id}
            className="grid grid-cols-[1fr_auto] items-baseline gap-3 border-b border-dotted border-cardstock/12 py-[5px] last:border-b-0"
          >
            <span
              className="text-cardstock/80"
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
              }}
            >
              {event.label}
              {event.metric !== null && (
                <em className="bcc-phosphor-text ml-2 not-italic" style={{ fontWeight: 500 }}>
                  {event.metric}
                </em>
              )}
            </span>
            <span
              className="text-cardstock/45"
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "10px",
                letterSpacing: "0.08em",
              }}
            >
              {event.ago}
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
