/**
 * TallyPanel — segmented bar + per-side counts. On the panelist branch
 * during reviewing we show a sealed placeholder; the server already
 * redacts the numbers but we don't even render zero placeholders so
 * there's nothing to misread. Extracted from DisputeDetail.tsx
 * (Phase 3.3 god-component split); markup and behavior unchanged.
 */

import type { PanelDispute } from "@/lib/api/types";

export function TallyPanel({
  dispute,
  sealed,
}: {
  dispute: PanelDispute;
  sealed: boolean;
}) {
  if (sealed) {
    return (
      <section
        aria-label="Tally — sealed during deliberation"
        className="border-2 border-ink/30 p-5"
        style={{ background: "var(--paper)" }}
      >
        <p className="bcc-mono text-cardstock-deep">TALLY //</p>
        <p
          className="bcc-stencil mt-2 text-2xl text-ink"
          style={{ letterSpacing: "0.06em" }}
        >
          SEALED
        </p>
        <p className="bcc-mono mt-2 text-ink-ghost">
          Tallies stay hidden until every panelist has weighed in.
          Independent calls only.
        </p>
      </section>
    );
  }

  const accepts = dispute.accepts;
  const rejects = dispute.rejects;
  const voted = accepts + rejects;
  const pending = Math.max(0, dispute.panel_size - voted);
  const acceptPct = pctOf(accepts, dispute.panel_size);
  const rejectPct = pctOf(rejects, dispute.panel_size);
  const pendingPct = Math.max(0, 100 - acceptPct - rejectPct);

  return (
    <section
      aria-label="Panel tally"
      className="border-2 border-ink/30 p-5"
      style={{ background: "var(--paper)" }}
    >
      <div className="flex items-baseline justify-between">
        <p className="bcc-mono text-cardstock-deep">TALLY //</p>
        <p className="bcc-mono text-ink">
          {voted}/{dispute.panel_size}
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={dispute.panel_size}
        aria-valuenow={voted}
        aria-label={`${voted} of ${dispute.panel_size} panelists have voted`}
        className="mt-3 flex h-3 w-full overflow-hidden border border-ink/40"
      >
        <span
          className="h-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: `${acceptPct}%`,
            background: "var(--verified)",
          }}
          aria-hidden
        />
        <span
          className="h-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: `${rejectPct}%`,
            background: "var(--safety)",
          }}
          aria-hidden
        />
        <span
          className="h-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{
            width: `${pendingPct}%`,
            backgroundImage:
              "repeating-linear-gradient(135deg, rgba(15,13,9,0.18) 0 6px, transparent 6px 12px)",
          }}
          aria-hidden
        />
      </div>

      <ul className="mt-5 flex flex-col gap-2">
        <TallyRow label="ACCEPT" count={accepts} colorVar="--verified" />
        <TallyRow label="REJECT" count={rejects} colorVar="--safety" />
        <TallyRow
          label="PENDING"
          count={pending}
          colorVar="--cardstock-deep"
          dimmed
        />
      </ul>
    </section>
  );
}

function TallyRow({
  label,
  count,
  colorVar,
  dimmed = false,
}: {
  label: string;
  count: number;
  colorVar: string;
  dimmed?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span
        className="bcc-mono"
        style={{
          color: dimmed ? "var(--cardstock-deep)" : `var(${colorVar})`,
        }}
      >
        <span
          aria-hidden
          className="mr-2 inline-block h-2 w-2"
          style={{
            background: dimmed ? "transparent" : `var(${colorVar})`,
            border: dimmed ? "1px dashed var(--cardstock-deep)" : "none",
          }}
        />
        {label}
      </span>
      <span
        className="bcc-stencil text-2xl"
        style={{
          color: dimmed ? "var(--cardstock-deep)" : "var(--ink)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </li>
  );
}

function pctOf(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  const raw = (numerator / denominator) * 100;
  return Math.max(0, Math.min(100, raw));
}
