/**
 * CaseBody — left column of the case file: reason quote, evidence
 * link, chain of custody. All sections share the dashed-rule rhythm
 * of /u/[handle]'s SectionFrame so this surface reads as part of the
 * same file metaphor. Extracted from DisputeDetail.tsx (Phase 3.3
 * god-component split); markup and behavior unchanged. SectionLabel +
 * CustodyEvent ride along — they're body-only vocabulary.
 */

import type { PanelDispute } from "@/lib/api/types";

import { formatAbsoluteUTC } from "./caseFileFormat";

export function CaseBody({
  dispute,
  sealed,
}: {
  dispute: PanelDispute;
  sealed: boolean;
}) {
  return (
    <div className="flex flex-col gap-10">
      <section>
        <SectionLabel n="01" label="THE REASON" />
        <blockquote
          className="mt-4 border-l-[3px] pl-5 font-serif italic text-ink"
          style={{
            borderColor: "var(--safety)",
            fontSize: "clamp(1rem, 1.8vw, 1.125rem)",
            lineHeight: 1.6,
          }}
        >
          &ldquo;{dispute.reason}&rdquo;
        </blockquote>
        <p className="bcc-mono mt-3 text-ink-ghost">
          DISPUTING {dispute.voter_name.toUpperCase()}&rsquo;S DOWNVOTE
        </p>
      </section>

      <section>
        <SectionLabel n="02" label="EVIDENCE" />
        {dispute.evidence_url !== "" ? (
          <a
            href={dispute.evidence_url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-4 flex items-stretch gap-0 transition hover:translate-x-[2px]"
          >
            <span
              className="bcc-stencil flex shrink-0 items-center px-3 py-3 text-[12px] tracking-[0.2em]"
              style={{
                background: "var(--weld)",
                color: "var(--ink)",
              }}
            >
              EXHIBIT A
            </span>
            <span
              className="bcc-mono flex flex-1 items-center break-all border border-l-0 border-ink/30 px-4 py-3 text-blueprint underline underline-offset-2"
              style={{ wordBreak: "break-all" }}
            >
              {dispute.evidence_url}
            </span>
          </a>
        ) : (
          <p className="bcc-mono mt-4 text-ink-ghost">
            NO EXHIBIT FILED
          </p>
        )}
      </section>

      <section>
        <SectionLabel n="03" label="CHAIN OF CUSTODY" />
        <ol className="mt-4 flex flex-col gap-3 border-l-2 border-ink/40 pl-5">
          <CustodyEvent
            label="FILED"
            timestamp={dispute.created_at}
            tone="active"
          />
          <CustodyEvent
            label={
              dispute.status === "reviewing"
                ? "DELIBERATING"
                : "RESOLVED"
            }
            timestamp={dispute.resolved_at ?? null}
            statusFallback={
              dispute.status === "reviewing" ? "ON THE FLOOR" : null
            }
            tone={dispute.status === "reviewing" ? "live" : "active"}
          />
        </ol>
        {sealed && (
          <p className="bcc-mono mt-4 text-cardstock-deep">
            * Reporter identity is sealed during deliberation. Decide on
            the merits of the reason and evidence alone.
          </p>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SectionLabel — "01 // THE REASON" kicker matching SectionFrame from
// /u/[handle]. Anchors the case body to the same numbered-file rhythm
// the rest of the operator surfaces use.
// ─────────────────────────────────────────────────────────────────────

function SectionLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="bcc-mono text-cardstock-deep">{n}</span>
      <span className="bcc-mono text-safety">{"//"} {label}</span>
      <span aria-hidden className="h-px flex-1 bg-ink/15" />
    </div>
  );
}

function CustodyEvent({
  label,
  timestamp,
  statusFallback,
  tone,
}: {
  label: string;
  timestamp: string | null;
  statusFallback?: string | null;
  tone: "active" | "live";
}) {
  return (
    <li className="relative pl-3">
      <span
        aria-hidden
        className="absolute left-[-9px] top-[7px] h-[10px] w-[10px]"
        style={{
          background:
            tone === "live" ? "var(--safety)" : "var(--cardstock-deep)",
          boxShadow:
            tone === "live"
              ? "0 0 0 3px rgba(240,90,40,0.18)"
              : "none",
        }}
      />
      <p className="bcc-mono text-ink">{label}</p>
      <p className="bcc-mono text-ink-ghost">
        {timestamp !== null
          ? formatAbsoluteUTC(timestamp)
          : (statusFallback ?? "—")}
      </p>
    </li>
  );
}
