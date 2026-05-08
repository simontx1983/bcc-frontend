"use client";

/**
 * MyDisputesList — page-owner view of the disputes they have filed.
 *
 * Companion to <PanelDutyList>. Where the panel list is the juror's
 * incoming queue, this is the reporter's outbox: every dispute the
 * viewer opened, in any state. Backend redactions don't apply here
 * (the reporter sees their own dispute fully) so tallies and verdicts
 * are live.
 *
 * Status legend (from the reporter's POV):
 *   - reviewing          → panel deliberating
 *   - accepted           → panel agreed; the downvote was struck
 *   - rejected           → panel disagreed; the downvote stands
 *   - timeout_no_quorum  → panel ran out of time; downvote stands
 */

import Link from "next/link";

import { useMyDisputes } from "@/hooks/useDisputes";
import type { PanelDispute } from "@/lib/api/types";

export function MyDisputesList() {
  const query = useMyDisputes();

  if (query.isPending) {
    return (
      <p className="bcc-mono text-cardstock-deep">Loading your disputes…</p>
    );
  }

  if (query.isError) {
    return (
      <div className="bcc-paper p-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load your filed disputes: {query.error.message}
        </p>
      </div>
    );
  }

  if (query.data.length === 0) {
    return <MyDisputesEmpty />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {query.data.map((dispute) => (
        <li key={dispute.id}>
          <MyDisputeRow dispute={dispute} />
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MyDisputeRow — single filed dispute. Status-driven styling: a live
// case shows panel progress; a resolved case shows the verdict.
// ─────────────────────────────────────────────────────────────────────

function MyDisputeRow({ dispute }: { dispute: PanelDispute }) {
  const reviewing = dispute.status === "reviewing";
  const totalVoted = dispute.accepts + dispute.rejects;

  return (
    <article className="bcc-paper p-5">
      <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-start">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="bcc-mono text-safety">CASE //</span>
            <Link
              href={`/disputes/${dispute.id}`}
              className="bcc-stencil text-2xl text-ink underline-offset-4 transition hover:underline hover:decoration-safety"
            >
              {dispute.page_title || "Untitled page"}
            </Link>
          </div>
          <p className="mt-1 bcc-mono text-ink-ghost">
            DISPUTING {dispute.voter_name.toUpperCase()}&rsquo;S DOWNVOTE
          </p>

          <div className="mt-4">
            <p className="bcc-mono text-cardstock-deep">YOUR CASE //</p>
            <p
              className="mt-1 font-serif text-ink"
              style={{ fontSize: "14px", lineHeight: 1.5 }}
            >
              &ldquo;{dispute.reason}&rdquo;
            </p>
          </div>

          {dispute.evidence_url !== "" && (
            <div className="mt-3">
              <p className="bcc-mono text-cardstock-deep">EVIDENCE //</p>
              <a
                href={dispute.evidence_url}
                target="_blank"
                rel="noreferrer noopener"
                className="bcc-mono mt-1 inline-block break-all text-blueprint underline hover:text-safety"
              >
                {dispute.evidence_url}
              </a>
            </div>
          )}

          <p className="bcc-mono mt-4 text-ink-ghost">
            FILED {formatRelativeUTC(dispute.created_at)}
            {reviewing && ` · ${totalVoted} OF ${dispute.panel_size} PANELISTS VOTED`}
            {!reviewing && dispute.resolved_at !== null && (
              ` · CLOSED ${formatRelativeUTC(dispute.resolved_at)}`
            )}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <StatusBadge status={dispute.status} />
          <Link
            href={`/disputes/${dispute.id}`}
            className="bcc-mono text-cardstock-deep underline-offset-4 transition hover:text-safety hover:underline motion-reduce:transition-none"
          >
            VIEW CASE &rarr;
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatusBadge — tints the verdict from the REPORTER's POV. Accepted
// is a win (verified-green), rejected is a loss (safety-orange),
// timeout is a wash (cardstock-deep), reviewing is in-flight.
// ─────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PanelDispute["status"] }) {
  const config = STATUS_CONFIG[status];
  return (
    <span
      className="bcc-mono rounded-sm border px-3 py-2 text-[10px] tracking-[0.22em]"
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
  PanelDispute["status"],
  { label: string; color: string; background: string; borderColor: string }
> = {
  reviewing: {
    label: "REVIEWING",
    color: "var(--blueprint)",
    background: "rgba(31, 110, 184, 0.08)",
    borderColor: "rgba(31, 110, 184, 0.32)",
  },
  accepted: {
    label: "WON · DOWNVOTE STRUCK",
    color: "var(--verified)",
    background: "rgba(44, 157, 102, 0.08)",
    borderColor: "rgba(44, 157, 102, 0.32)",
  },
  rejected: {
    label: "LOST · DOWNVOTE STANDS",
    color: "var(--safety)",
    background: "rgba(240, 90, 40, 0.08)",
    borderColor: "rgba(240, 90, 40, 0.32)",
  },
  dismissed: {
    label: "DISMISSED BY ADMIN",
    color: "var(--safety)",
    background: "rgba(240, 90, 40, 0.08)",
    borderColor: "rgba(240, 90, 40, 0.32)",
  },
  timeout_no_quorum: {
    label: "TIMED OUT · NO QUORUM",
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

// ─────────────────────────────────────────────────────────────────────
// MyDisputesEmpty — most members never file a dispute. Frame the empty
// state as healthy state, not as missing functionality.
// ─────────────────────────────────────────────────────────────────────

function MyDisputesEmpty() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">CLEAN RECORD</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        You haven&rsquo;t filed any disputes.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Disputes start from a page you own &mdash; open one when a downvote
        looks bogus. You&rsquo;ll find the option on your page&rsquo;s
        profile, next to the trust score.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// formatRelativeUTC — local copy of the helper from PanelQueue.tsx.
// Stable in SSR (UTC) and tiny enough that exporting from the other
// file would just create import drift between two surfaces that don't
// otherwise depend on each other.
// ─────────────────────────────────────────────────────────────────────

function formatRelativeUTC(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffSec = Math.floor((Date.now() - t) / 1000);
  if (diffSec < 60) return "JUST NOW";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}M AGO`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}H AGO`;
  if (diffSec < 86_400 * 30) return `${Math.floor(diffSec / 86_400)}D AGO`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(t))
    .toUpperCase();
}
