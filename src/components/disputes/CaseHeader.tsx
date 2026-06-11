/**
 * CaseHeader — "CASE №147" wall, status pill, and the disputed page
 * quote underneath. Resolved disputes overlay a diagonal verdict stamp
 * across the case-no for unmistakable verdict legibility. Extracted
 * from DisputeDetail.tsx (Phase 3.3 god-component split); markup and
 * behavior unchanged. StatusPill + VerdictStamp ride along — they're
 * header-only vocabulary.
 */

import type { DisputeStatus, PanelDispute } from "@/lib/api/types";

import { formatRelativeUTC } from "./caseFileFormat";
import type { Source } from "./DisputeDetail";

export function CaseHeader({
  dispute,
  source,
  sealed,
  resolved,
}: {
  dispute: PanelDispute;
  source: Source;
  sealed: boolean;
  resolved: boolean;
}) {
  return (
    <header>
      <p className="bcc-mono text-safety">
        {source === "panel" ? "PANEL DUTY" : "YOUR FILED CASE"}
      </p>

      <div className="relative mt-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h1
          className="bcc-stencil leading-[0.85] text-ink"
          style={{
            fontSize: "clamp(4.5rem, 14vw, 11rem)",
            letterSpacing: "-0.01em",
          }}
        >
          CASE&nbsp;<span style={{ color: "var(--safety)" }}>№{dispute.id}</span>
        </h1>

        <StatusPill status={dispute.status} />

        {resolved && <VerdictStamp status={dispute.status} />}
      </div>

      <div
        className="mt-6 border-t border-dashed border-ink/25 pt-5"
        aria-hidden={false}
      >
        <p className="bcc-mono text-cardstock-deep">FILED AGAINST //</p>
        <p
          className="mt-2 font-serif italic text-ink"
          style={{
            fontSize: "clamp(1.25rem, 2.6vw, 1.75rem)",
            lineHeight: 1.35,
          }}
        >
          &ldquo;{dispute.page_title || "Untitled page"}&rdquo;
        </p>

        <p className="bcc-mono mt-4 text-ink-ghost">
          {sealed ? (
            <>
              REPORTER SEALED &middot; FILED{" "}
              {formatRelativeUTC(dispute.created_at)} &middot; PANEL OF{" "}
              {dispute.panel_size}
            </>
          ) : (
            <>
              {dispute.reporter_name !== "" && (
                <>
                  REPORTED BY {dispute.reporter_name.toUpperCase()} &middot;{" "}
                </>
              )}
              FILED {formatRelativeUTC(dispute.created_at)} &middot; PANEL OF{" "}
              {dispute.panel_size}
              {dispute.resolved_at !== null && (
                <> &middot; CLOSED {formatRelativeUTC(dispute.resolved_at)}</>
              )}
            </>
          )}
        </p>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// VerdictStamp — the diagonal stamp overlay on resolved cases.
// Pure CSS; sits absolute-positioned in the header so the case-no
// reads under it. No JS, no animation — the stamp is the moment.
// ─────────────────────────────────────────────────────────────────────

function VerdictStamp({ status }: { status: DisputeStatus }) {
  const config = VERDICT_STAMP[status];
  if (config === undefined) return null;
  return (
    <span
      aria-hidden
      className="bcc-stencil pointer-events-none absolute right-2 top-2 select-none px-4 py-1 sm:right-8 sm:top-6"
      style={{
        color: config.color,
        border: `4px solid ${config.color}`,
        background: "rgba(255,255,255,0.0)",
        transform: "rotate(-9deg)",
        fontSize: "clamp(1.5rem, 4vw, 2.75rem)",
        letterSpacing: "0.08em",
        opacity: 0.85,
      }}
    >
      {config.label}
    </span>
  );
}

const VERDICT_STAMP: Partial<
  Record<DisputeStatus, { label: string; color: string }>
> = {
  accepted: { label: "ACCEPTED", color: "var(--verified)" },
  rejected: { label: "REJECTED", color: "var(--safety)" },
  dismissed: { label: "DISMISSED", color: "var(--safety)" },
  timeout_no_quorum: {
    label: "TIMED OUT",
    color: "var(--cardstock-deep)",
  },
  closed: { label: "CLOSED", color: "var(--cardstock-deep)" },
};

// ─────────────────────────────────────────────────────────────────────
// StatusPill — inline-styled pill matching MyDisputesList's rhythm so
// the detail surface and the list speak the same status vocabulary.
// ─────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: DisputeStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="bcc-mono inline-flex shrink-0 items-center border px-3 py-2 text-[10px] tracking-[0.22em]"
      style={{
        color: config.color,
        background: config.background,
        borderColor: config.borderColor,
      }}
    >
      {config.label}
    </span>
  );
}

const STATUS_CONFIG: Record<
  DisputeStatus,
  { label: string; color: string; background: string; borderColor: string }
> = {
  reviewing: {
    label: "REVIEWING",
    color: "var(--blueprint)",
    background: "rgba(31, 110, 184, 0.08)",
    borderColor: "rgba(31, 110, 184, 0.32)",
  },
  accepted: {
    label: "ACCEPTED",
    color: "var(--verified)",
    background: "rgba(44, 157, 102, 0.08)",
    borderColor: "rgba(44, 157, 102, 0.32)",
  },
  rejected: {
    label: "REJECTED",
    color: "var(--safety)",
    background: "rgba(240, 90, 40, 0.08)",
    borderColor: "rgba(240, 90, 40, 0.32)",
  },
  dismissed: {
    label: "DISMISSED",
    color: "var(--safety)",
    background: "rgba(240, 90, 40, 0.08)",
    borderColor: "rgba(240, 90, 40, 0.32)",
  },
  timeout_no_quorum: {
    label: "TIMED OUT",
    color: "var(--cardstock-deep)",
    background: "rgba(204, 198, 184, 0.18)",
    borderColor: "rgba(204, 198, 184, 0.4)",
  },
  closed: {
    label: "CLOSED",
    color: "var(--cardstock-deep)",
    background: "rgba(204, 198, 184, 0.18)",
    borderColor: "rgba(204, 198, 184, 0.4)",
  },
};
