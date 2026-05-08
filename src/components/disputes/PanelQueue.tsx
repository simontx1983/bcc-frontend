"use client";

/**
 * PanelQueue — §D5 panelist queue surface.
 *
 * Mounted at /panel. Lists every dispute the viewer is currently
 * assigned to as a panelist (server-pre-filtered to status=reviewing).
 * Each row shows what the panelist needs to decide on:
 *   - which page is in dispute
 *   - the vote that's being challenged (voter + excerpt)
 *   - the reporter's reason
 *   - the panelist's own decision (if already cast)
 *
 * Privacy contract from the controller: vote tallies and reporter
 * identity are HIDDEN from panelists during deliberation to enforce
 * independent decision-making. The UI must not surface accepts/rejects
 * counts on this page — even as 0/0.
 *
 * Click a row → /disputes/{id} (full-page case file). The detail
 * surface owns the vote action. Already-voted rows show
 * "ACCEPTED"/"REJECTED" badge plus a "REVIEW CASE" link.
 */

import Link from "next/link";

import { useMyParticipation, usePanelQueue } from "@/hooks/useDisputes";
import type { MyParticipationStatus, PanelDispute } from "@/lib/api/types";

export function PanelQueue() {
  const participation = useMyParticipation();

  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-12">
      <Header participation={participation.data ?? null} />
      <div className="mt-10">
        <PanelDutyList />
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PanelDutyList — the queue list, separated from the page chrome so
// /disputes can mount it inside a tab without bringing the full Header
// along. Clicking a row routes to /disputes/{id} where the full-page
// case file owns the vote action.
// ─────────────────────────────────────────────────────────────────────

export function PanelDutyList() {
  const query = usePanelQueue();

  return (
    <section>
      {query.isPending && (
        <p className="bcc-mono text-cardstock-deep">Loading queue…</p>
      )}

      {query.isError && (
        <div className="bcc-paper p-6">
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load your panel queue: {query.error.message}
          </p>
        </div>
      )}

      {query.isSuccess && query.data.length === 0 && <PanelEmpty />}

      {query.isSuccess && query.data.length > 0 && (
        <ul className="flex flex-col gap-4">
          {query.data.map((dispute) => (
            <li key={dispute.id}>
              <PanelRow dispute={dispute} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Header — file-rail vocabulary; same rhythm as /directory's top strip.
// Renders the §D5 participation indicator when the viewer has any data
// loaded; the strip self-hides while loading rather than flashing zeros.
// ─────────────────────────────────────────────────────────────────────

function Header({
  participation,
}: {
  participation: MyParticipationStatus | null;
}) {
  return (
    <>
      <div className="border-b border-dashed border-cardstock/15 pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; PANEL DUTY</span>
        </span>
      </div>

      <header className="mt-10">
        <p className="bcc-mono text-safety">DELIBERATION ROOM</p>
        <h1
          className="bcc-stencil mt-2 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)" }}
        >
          You&rsquo;ve been called.
        </h1>
        <p className="mt-3 max-w-2xl font-serif leading-relaxed text-cardstock-deep">
          The floor needs your read on the disputes below. Each one is a
          downvote a page owner says is invalid. Read the reason, weigh
          the evidence, and vote. Tallies stay hidden until every
          panelist has weighed in &mdash; independent calls only.
        </p>
      </header>

      {participation !== null && (
        <ParticipationStrip participation={participation} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ParticipationStrip — §D5 progress indicator under the heading.
// Shows the panelist their daily/lifetime trust earnings against the
// caps and a hint about the accuracy floor. The data source is
// /disputes/participation/me — caps come from the response so we
// never mirror backend constants in the frontend.
// ─────────────────────────────────────────────────────────────────────

export function ParticipationStrip({
  participation,
}: {
  participation: MyParticipationStatus;
}) {
  const dailyPct = clampPct(
    participation.earned_today,
    participation.caps.daily_trust,
  );
  const lifetimePct = clampPct(
    participation.earned_lifetime,
    participation.caps.lifetime_trust,
  );
  const accuracyUnlocked =
    participation.credited_lifetime >= participation.caps.min_for_accuracy;
  const remainingForAccuracy =
    participation.caps.min_for_accuracy - participation.credited_lifetime;

  return (
    <section
      aria-label="Your panel-vote credit progress"
      className="mt-7 border-y border-dashed border-cardstock/15 py-5"
    >
      <div className="grid gap-5 md:grid-cols-[1fr_1fr_auto]">
        <ParticipationMeter
          label="TODAY"
          earned={participation.earned_today}
          cap={participation.caps.daily_trust}
          pct={dailyPct}
          subtitle={
            participation.credited_today === 0
              ? "No votes credited yet today"
              : `${participation.credited_today} vote${participation.credited_today === 1 ? "" : "s"} credited`
          }
        />
        <ParticipationMeter
          label="LIFETIME"
          earned={participation.earned_lifetime}
          cap={participation.caps.lifetime_trust}
          pct={lifetimePct}
          subtitle={
            participation.correct_count > 0
              ? `${participation.correct_count} correct call${participation.correct_count === 1 ? "" : "s"}`
              : "No verdicts yet — accuracy scores when disputes resolve"
          }
        />
        <div className="self-end">
          <p className="bcc-mono text-cardstock-deep">ACCURACY BONUS //</p>
          <p
            className="bcc-stencil mt-1 text-2xl"
            style={{
              color: accuracyUnlocked ? "var(--verified)" : "var(--cardstock-deep)",
            }}
          >
            {accuracyUnlocked ? "UNLOCKED" : "LOCKED"}
          </p>
          <p
            className="bcc-mono mt-1 text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {accuracyUnlocked
              ? `+${participation.caps.accuracy_weight.toFixed(2)} per correct call`
              : `${remainingForAccuracy} more credited vote${
                  remainingForAccuracy === 1 ? "" : "s"
                } to unlock`}
          </p>
        </div>
      </div>
    </section>
  );
}

function ParticipationMeter({
  label,
  earned,
  cap,
  pct,
  subtitle,
}: {
  label: string;
  earned: number;
  cap: number;
  pct: number;
  subtitle: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="bcc-mono text-cardstock-deep">{label} {"//"}</span>
        <span className="bcc-mono text-cardstock">
          {earned.toFixed(2)} / {cap.toFixed(2)} TRUST
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={`${label} trust earned: ${earned.toFixed(2)} of ${cap.toFixed(2)}`}
        className="mt-2 h-1.5 overflow-hidden bg-cardstock/10"
      >
        <div
          className="h-full bg-safety transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="bcc-mono mt-1 text-cardstock-deep">{subtitle}</p>
    </div>
  );
}

function clampPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  const raw = (numerator / denominator) * 100;
  return Math.max(0, Math.min(100, raw));
}

// ─────────────────────────────────────────────────────────────────────
// PanelRow — one dispute in the queue. Distinct visual states for
// "needs your vote" (action button) vs. "you've voted" (decision badge).
// ─────────────────────────────────────────────────────────────────────

function PanelRow({ dispute }: { dispute: PanelDispute }) {
  const voted = dispute.my_decision !== null;

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
            DISPUTED VOTE BY {dispute.voter_name.toUpperCase()}
          </p>

          <div className="mt-4 grid gap-3">
            <div>
              <p className="bcc-mono text-cardstock-deep">REPORTER&rsquo;S CASE //</p>
              <p
                className="mt-1 font-serif text-ink"
                style={{ fontSize: "14px", lineHeight: 1.5 }}
              >
                &ldquo;{dispute.reason}&rdquo;
              </p>
            </div>

            {dispute.evidence_url !== "" && (
              <div>
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
          </div>

          <p className="bcc-mono mt-4 text-ink-ghost">
            FILED {formatRelativeUTC(dispute.created_at)} &middot; PANEL OF{" "}
            {dispute.panel_size}
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {voted && <DecisionBadge decision={dispute.my_decision} />}
          <Link
            href={`/disputes/${dispute.id}`}
            className="bcc-stencil rounded-sm bg-ink px-5 py-2.5 text-center text-[12px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint motion-reduce:transition-none"
          >
            {voted ? "REVIEW CASE" : "CAST YOUR VOTE"}
          </Link>
        </div>
      </div>
    </article>
  );
}

function DecisionBadge({
  decision,
}: {
  decision: "accept" | "reject" | null;
}) {
  if (decision === null) return null;
  const accepted = decision === "accept";
  return (
    <span
      className="bcc-mono rounded-sm border px-3 py-2 text-[10px] tracking-[0.22em]"
      style={{
        color: accepted ? "var(--verified)" : "var(--safety)",
        background: accepted
          ? "rgba(44, 157, 102, 0.08)"
          : "rgba(240, 90, 40, 0.08)",
        borderColor: accepted
          ? "rgba(44, 157, 102, 0.32)"
          : "rgba(240, 90, 40, 0.32)",
      }}
    >
      YOU VOTED · {accepted ? "ACCEPT" : "REJECT"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PanelEmpty — most visitors who navigate here aren't on any active
// panel. Reframe the empty state away from "you have nothing" toward
// "you're not on duty right now."
// ─────────────────────────────────────────────────────────────────────

function PanelEmpty() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">NOT ON DUTY</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        No cases waiting on you.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Panelists are picked from Trusted and Elite tier members with clean
        records. Stay on the floor &mdash; the call comes when it comes.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// formatRelativeUTC — light relative-time helper. The server returns
// ISO 8601 UTC; we render "5m ago" / "3h ago" / "2d ago" / falls back
// to "Apr 30" past 30 days. Stable in SSR (UTC, not local).
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