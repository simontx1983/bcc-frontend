"use client";

/**
 * DisputesPanel — paper sheet listing disputes the member has opened
 * against downvotes on pages they own. Status pill on the left
 * (open/resolved/dismissed via data-status), subject + body in the
 * middle, time on the right.
 *
 * Voice note: prior copy on this surface used "signed" and "on-chain
 * attestations" — that was loose language. BCC reads chain data but
 * doesn't write to chain; disputes are pure reputation-engine records.
 * Copy here reflects the real mental model: a page owner opens a
 * dispute against a downvote → a panel of {DISPUTE_PANEL_SIZE}
 * reviews → verdict.
 *
 * Lazy-fetches via useUserDisputes on mount.
 */

import { useUserDisputes } from "@/hooks/useUserActivity";
import type { MemberDispute } from "@/lib/api/types";

interface DisputesPanelProps {
  handle: string;
}

export function DisputesPanel({ handle }: DisputesPanelProps) {
  const query = useUserDisputes(handle);

  if (query.isPending) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p className="bcc-mono text-ink-soft">Loading disputes…</p>
        </div>
      </article>
    );
  }

  if (query.isError) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load disputes: {query.error.message}
          </p>
        </div>
      </article>
    );
  }

  if (query.data.hidden) {
    return (
      <article className="bcc-paper">
        <Header />
        <div className="px-8 py-12">
          <p
            className="bcc-mono mb-3 text-safety"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            PRIVATE
          </p>
          <h4
            className="bcc-stencil text-ink"
            style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
          >
            Disputes are hidden.
          </h4>
          <p
            className="font-serif italic text-ink-soft"
            style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
          >
            This member has chosen to keep their dispute history off the
            public page. The record persists.
          </p>
        </div>
      </article>
    );
  }

  return <DisputesPanelStatic disputes={query.data.items} />;
}

// ──────────────────────────────────────────────────────────────────────
// Static variant — renders an array.
// ──────────────────────────────────────────────────────────────────────

function DisputesPanelStatic({ disputes }: { disputes: MemberDispute[] }) {
  return (
    <article className="bcc-paper">
      <Header />

      {disputes.length === 0 ? (
        <DisputesEmpty />
      ) : (
        <ul>
          {disputes.map((dispute) => (
            <li
              key={dispute.id}
              className="grid grid-cols-[auto_1fr_auto] items-start gap-4 border-b border-dashed border-ink/22 px-5 py-4 last:border-b-0"
            >
              <span className="bcc-pill mt-1" data-status={dispute.status}>
                {dispute.status_label}
              </span>
              <div className="font-serif text-ink" style={{ fontSize: "13.5px", lineHeight: 1.4 }}>
                <strong
                  className="bcc-stencil block text-ink"
                  style={{ fontSize: "15px", letterSpacing: "0.02em", marginBottom: "4px", fontWeight: 800 }}
                >
                  {dispute.subject}
                </strong>
                {dispute.body}
                <em
                  className="bcc-mono mt-2 block text-ink-ghost"
                  style={{ fontSize: "8.5px", letterSpacing: "0.16em", fontStyle: "normal" }}
                >
                  {dispute.scope_label}
                </em>
              </div>
              <span
                className="bcc-mono text-ink-ghost"
                style={{ fontSize: "9px", letterSpacing: "0.12em" }}
              >
                {dispute.posted_at_label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Header() {
  return (
    <header className="bcc-paper-head">
      <h3 className="bcc-stencil" style={{ fontSize: "16px", letterSpacing: "0.18em" }}>
        Disputes opened
      </h3>
      <span className="bcc-mono text-weld" style={{ fontSize: "9px" }}>
        FILED AGAINST DOWNVOTES
      </span>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────
// DisputesEmpty — paper-sheet empty state. Disputes are a heavy
// instrument; the copy is sober rather than encouraging — we don't
// want to read like we're rooting for the user to file one.
// ──────────────────────────────────────────────────────────────────────

function DisputesEmpty() {
  return (
    <div className="px-8 py-12">
      <p
        className="bcc-mono mb-3 text-safety"
        style={{ fontSize: "10px", letterSpacing: "0.24em" }}
      >
        NONE ON FILE
      </p>
      <h4
        className="bcc-stencil text-ink"
        style={{ fontSize: "26px", letterSpacing: "0.02em", lineHeight: 1.05 }}
      >
        No disputes opened.
      </h4>
      <p
        className="font-serif italic text-ink-soft"
        style={{ fontSize: "16px", lineHeight: 1.5, maxWidth: "560px", marginTop: "10px" }}
      >
        When a downvote on a page you own looks invalid, you open a
        dispute &mdash; a panel of five reviews the case and decides.
        Filed disputes land here, open or resolved.
      </p>
    </div>
  );
}
