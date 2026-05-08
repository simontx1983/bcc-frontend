"use client";

/**
 * DisputeDetail — full-page case-file surface for /disputes/[id].
 *
 * Mounted at /disputes/{id} after the server route validates the param.
 * No detail endpoint exists; we resolve the row by id from the existing
 * /disputes/panel and /disputes/mine query caches and inherit their
 * privacy contract. When both queries succeed but neither has the id,
 * we render a "case not found" state — that lets a stale deeplink land
 * gracefully without a network 404 shape we don't have a handler for.
 *
 * Voting lives directly on the page — no modal. The mutation is the
 * same useCastPanelVote the modal used; on success we invalidate both
 * the panel queue and the participation indicator so the user's next
 * navigation back to /disputes shows the flipped row and updated trust.
 *
 * Privacy: panelists during reviewing get redacted tallies and reporter
 * identity from the server. The UI hides tally numbers and reporter
 * info entirely on that branch — even as zeros — so the panelist
 * can't infer the verdict from a delta.
 */

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  MY_DISPUTES_QUERY_KEY_ROOT,
  MY_PARTICIPATION_QUERY_KEY,
  PANEL_QUEUE_QUERY_KEY_ROOT,
  useCastPanelVote,
  useMyDisputes,
  useMyParticipation,
  usePanelQueue,
} from "@/hooks/useDisputes";
import {
  BccApiError,
  type CastPanelVoteResponse,
  type DisputeStatus,
  type MyParticipationStatus,
  type PanelDispute,
} from "@/lib/api/types";

const NOTE_MAX_LENGTH = 500;

type Source = "panel" | "filed";

interface DisputeDetailProps {
  id: number;
}

export function DisputeDetail({ id }: DisputeDetailProps) {
  const panelQueue = usePanelQueue();
  const myDisputes = useMyDisputes();
  const participation = useMyParticipation();

  const panelMatch = panelQueue.data?.find((d) => d.id === id);
  const reporterMatch = myDisputes.data?.find((d) => d.id === id);

  const source: Source | null =
    panelMatch !== undefined
      ? "panel"
      : reporterMatch !== undefined
        ? "filed"
        : null;

  const dispute = panelMatch ?? reporterMatch ?? null;

  const isLoading = panelQueue.isPending || myDisputes.isPending;
  const isError = panelQueue.isError && myDisputes.isError;

  if (isLoading) {
    return <CaseFileChrome>{<CaseFileSkeleton />}</CaseFileChrome>;
  }

  if (isError) {
    return (
      <CaseFileChrome>
        <CaseFileError
          message={
            panelQueue.error?.message ??
            myDisputes.error?.message ??
            "Couldn't load this case."
          }
        />
      </CaseFileChrome>
    );
  }

  if (dispute === null || source === null) {
    return (
      <CaseFileChrome>
        <CaseFileMissing id={id} />
      </CaseFileChrome>
    );
  }

  return (
    <CaseFileChrome caseNumber={dispute.id}>
      <CaseFile
        dispute={dispute}
        source={source}
        participation={participation.data ?? null}
      />
    </CaseFileChrome>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CaseFileChrome — page shell. Owns the file-rail crumb and the safety
// underline that visually frames the case below it. Same vocabulary as
// /u/[handle]'s FileRail so the surface reads as part of the same
// "operator file" universe.
// ─────────────────────────────────────────────────────────────────────

function CaseFileChrome({
  children,
  caseNumber,
}: {
  children: React.ReactNode;
  caseNumber?: number;
}) {
  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-10">
      <div className="border-b border-dashed border-cardstock/15 pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; DISPUTES</span>
          {caseNumber !== undefined && (
            <span className="text-cardstock">
              &nbsp;//&nbsp; CASE №{caseNumber}
            </span>
          )}
        </span>
      </div>

      <div
        aria-hidden
        className="mt-3 h-[2px]"
        style={{ background: "var(--safety)" }}
      />

      {children}

      <div className="mt-12 border-t border-dashed border-cardstock/15 pt-5">
        <Link
          href="/disputes"
          className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep transition hover:text-safety"
        >
          <span aria-hidden>&larr;</span>
          <span>BACK TO DISPUTE ROOM</span>
        </Link>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CaseFile — the populated case-file surface. Composition:
//   • Header block (CASE №id + status pill + page title quote + meta)
//     overlaid with a diagonal verdict stamp when resolved.
//   • Two-column body (md+):
//       LEFT  — the reason, evidence, chain-of-custody timeline.
//       RIGHT — the tally panel (sticky), then the YOUR CALL panel.
// ─────────────────────────────────────────────────────────────────────

function CaseFile({
  dispute,
  source,
  participation,
}: {
  dispute: PanelDispute;
  source: Source;
  participation: MyParticipationStatus | null;
}) {
  const sealed = source === "panel" && dispute.status === "reviewing";
  const reviewing = dispute.status === "reviewing";
  const resolved = !reviewing;

  return (
    <article className="mt-10">
      <CaseHeader
        dispute={dispute}
        source={source}
        sealed={sealed}
        resolved={resolved}
      />

      <div className="mt-12 grid gap-10 md:grid-cols-[1fr_minmax(320px,400px)] md:gap-12">
        <CaseBody dispute={dispute} sealed={sealed} />

        <aside className="flex flex-col gap-8 md:sticky md:top-24 md:self-start">
          <TallyPanel dispute={dispute} sealed={sealed} />
          {source === "panel" && (
            <YourCallPanel
              dispute={dispute}
              participation={participation}
            />
          )}
          {source === "filed" && reviewing && <ReporterWaiting />}
        </aside>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CaseHeader — "CASE №147" wall, status pill, and the disputed page
// quote underneath. Resolved disputes overlay a diagonal verdict stamp
// across the case-no for unmistakable verdict legibility.
// ─────────────────────────────────────────────────────────────────────

function CaseHeader({
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
// CaseBody — left column: reason quote, evidence link, chain of custody.
// All sections share the dashed-rule rhythm of /u/[handle]'s SectionFrame
// so this surface reads as part of the same file metaphor.
// ─────────────────────────────────────────────────────────────────────

function CaseBody({
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
// TallyPanel — segmented bar + per-side counts. On the panelist branch
// during reviewing we show a sealed placeholder; the server already
// redacts the numbers but we don't even render zero placeholders so
// there's nothing to misread.
// ─────────────────────────────────────────────────────────────────────

function TallyPanel({
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

// ─────────────────────────────────────────────────────────────────────
// YourCallPanel — voting UI for panelists. Three branches:
//   • already voted             → locked decision badge + lifetime counts
//   • reviewing + not voted     → ACCEPT / REJECT + optional note + submit
//   • dispute already resolved  → no action; brief "you weren't on this"
//                                 hint when applicable
// On a successful cast the local CastPanelVoteResponse drives an inline
// "VOTE RECORDED" panel — we don't wait for the queue refetch, the
// invalidation kicks the fetch in the background.
// ─────────────────────────────────────────────────────────────────────

function YourCallPanel({
  dispute,
  participation,
}: {
  dispute: PanelDispute;
  participation: MyParticipationStatus | null;
}) {
  const queryClient = useQueryClient();
  const cast = useCastPanelVote();

  const [decision, setDecision] = useState<"accept" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CastPanelVoteResponse | null>(null);

  const noteOverCap = note.length > NOTE_MAX_LENGTH;
  const canSubmit = decision !== null && !noteOverCap && !cast.isPending;
  const reviewing = dispute.status === "reviewing";

  if (result !== null) {
    return <YourCallRecorded result={result} />;
  }

  if (dispute.my_decision !== null) {
    return (
      <YourCallLocked
        decision={dispute.my_decision}
        participation={participation}
      />
    );
  }

  if (!reviewing) {
    return (
      <section
        className="border-2 border-ink/30 p-5"
        style={{ background: "var(--paper)" }}
      >
        <p className="bcc-mono text-cardstock-deep">YOUR CALL //</p>
        <p className="bcc-stencil mt-2 text-2xl text-ink">CASE CLOSED</p>
        <p className="bcc-mono mt-2 text-ink-ghost">
          Deliberation ended before your vote landed.
        </p>
      </section>
    );
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || decision === null) return;
    setError(null);
    try {
      const trimmedNote = note.trim();
      const response = await cast.mutateAsync({
        disputeId: dispute.id,
        request: {
          decision,
          ...(trimmedNote !== "" ? { note: trimmedNote } : {}),
        },
      });
      void queryClient.invalidateQueries({
        queryKey: PANEL_QUEUE_QUERY_KEY_ROOT,
      });
      void queryClient.invalidateQueries({
        queryKey: MY_DISPUTES_QUERY_KEY_ROOT,
      });
      void queryClient.invalidateQueries({
        queryKey: MY_PARTICIPATION_QUERY_KEY,
      });
      setResult(response);
    } catch (err) {
      setError(humanizeError(err));
    }
  };

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="border-2 border-ink/30 p-5"
      style={{ background: "var(--paper)" }}
    >
      <p className="bcc-mono text-safety">YOUR CALL //</p>
      <p className="bcc-stencil mt-1 text-2xl text-ink">Cast your vote.</p>

      <fieldset className="mt-4">
        <legend className="sr-only">Decision</legend>
        <div role="radiogroup" aria-label="Decision" className="grid gap-2">
          <DecisionButton
            value="accept"
            label="ACCEPT"
            description="The reporter has a case. Strike the downvote."
            accent="var(--verified)"
            selected={decision === "accept"}
            onSelect={() => setDecision("accept")}
          />
          <DecisionButton
            value="reject"
            label="REJECT"
            description="The downvote stands. The dispute is unfounded."
            accent="var(--safety)"
            selected={decision === "reject"}
            onSelect={() => setDecision("reject")}
          />
        </div>
      </fieldset>

      <div className="mt-4">
        <label
          htmlFor="case-note"
          className="bcc-mono mb-2 block text-cardstock-deep"
        >
          INTERNAL NOTE //
          <span className="ml-2 text-ink-ghost">
            (optional · audit log only)
          </span>
        </label>
        <textarea
          id="case-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Anything operators should know about how you read this case."
          className="w-full border border-ink/30 bg-transparent p-3 font-serif text-ink"
          style={{ resize: "vertical" }}
        />
        <div className="bcc-mono mt-1 text-right text-cardstock-deep">
          {note.length}/{NOTE_MAX_LENGTH}
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono mt-3 text-safety">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        aria-disabled={!canSubmit}
        className={
          "bcc-stencil mt-4 inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-[13px] tracking-[0.22em] transition motion-reduce:transition-none " +
          (canSubmit
            ? "bg-ink text-cardstock hover:bg-blueprint"
            : "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60")
        }
      >
        {cast.isPending ? "RECORDING…" : "RECORD VOTE"}
      </button>
    </form>
  );
}

function DecisionButton({
  value,
  label,
  description,
  accent,
  selected,
  onSelect,
}: {
  value: "accept" | "reject";
  label: string;
  description: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-value={value}
      onClick={onSelect}
      className="group relative flex flex-col items-stretch gap-1 border p-3 text-left transition motion-reduce:transition-none"
      style={{
        borderColor: selected ? accent : "rgba(15,13,9,0.3)",
        boxShadow: selected ? `inset 0 0 0 2px ${accent}` : "none",
        background: selected ? "rgba(255,255,255,0.4)" : "transparent",
      }}
    >
      <span
        className="bcc-stencil text-xl"
        style={{ color: accent }}
      >
        {label}
      </span>
      <span className="font-serif text-ink-soft" style={{ fontSize: "13px" }}>
        {description}
      </span>
    </button>
  );
}

function YourCallLocked({
  decision,
  participation,
}: {
  decision: "accept" | "reject";
  participation: MyParticipationStatus | null;
}) {
  const accepted = decision === "accept";
  const accent = accepted ? "var(--verified)" : "var(--safety)";

  return (
    <section
      aria-label="Your vote on this case"
      className="border-2 p-5"
      style={{
        background: "var(--paper)",
        borderColor: accent,
      }}
    >
      <p className="bcc-mono text-cardstock-deep">YOUR CALL //</p>
      <p
        className="bcc-stencil mt-2 text-3xl"
        style={{ color: accent }}
      >
        {accepted ? "ACCEPT" : "REJECT"} · LOCKED
      </p>
      <p className="bcc-mono mt-2 text-ink-ghost">
        Sealed. The panel keeps deliberating; come back for the verdict.
      </p>

      {participation !== null && (
        <div className="mt-4 border-t border-dashed border-ink/20 pt-4">
          <p className="bcc-mono text-cardstock-deep">PANEL DUTY TODAY //</p>
          <p className="bcc-mono mt-1 text-ink">
            {participation.credited_today} VOTE
            {participation.credited_today === 1 ? "" : "S"} CREDITED ·{" "}
            {participation.earned_today.toFixed(2)}/
            {participation.caps.daily_trust.toFixed(2)} TRUST
          </p>
        </div>
      )}
    </section>
  );
}

function YourCallRecorded({ result }: { result: CastPanelVoteResponse }) {
  const accepted = result.decision === "accept";
  const accent = accepted ? "var(--verified)" : "var(--safety)";
  const credited = result.participation.credited;

  return (
    <section
      aria-label="Vote recorded"
      className="border-2 p-5"
      style={{
        background: "var(--paper)",
        borderColor: accent,
        boxShadow: `inset 0 0 0 1px ${accent}`,
      }}
    >
      <p className="bcc-mono text-safety">VOTE RECORDED //</p>
      <p
        className="bcc-stencil mt-2 text-3xl"
        style={{ color: accent }}
      >
        YOU VOTED {accepted ? "ACCEPT" : "REJECT"}
      </p>
      <p className="bcc-mono mt-2 text-ink-ghost">
        Sealed. Tallies stay hidden until quorum.
      </p>

      <div className="mt-4 border-t border-dashed border-ink/20 pt-4">
        <p className="bcc-mono text-cardstock-deep">PARTICIPATION CREDIT //</p>
        <p
          className="bcc-stencil mt-1 text-xl"
          style={{ color: credited ? accent : "var(--ink)" }}
        >
          {credited ? "+1 CREDIT" : "NO CREDIT THIS TIME"}
        </p>
        <p
          className="mt-2 font-serif text-ink-soft"
          style={{ fontSize: "13px", lineHeight: 1.5 }}
        >
          {creditExplanation(credited, result.participation.reason)}
        </p>
        <p className="bcc-mono mt-3 text-ink-ghost">
          {result.participation.credited_today} TODAY ·{" "}
          {result.participation.credited_lifetime} LIFETIME
        </p>
      </div>
    </section>
  );
}

function ReporterWaiting() {
  return (
    <section
      className="border-2 border-ink/30 p-5"
      style={{ background: "var(--paper)" }}
    >
      <p className="bcc-mono text-cardstock-deep">YOUR FILING //</p>
      <p className="bcc-stencil mt-2 text-2xl text-ink">ON THE FLOOR</p>
      <p className="bcc-mono mt-2 text-ink-ghost">
        Three panelists are weighing your case. You can&rsquo;t vote on
        your own dispute &mdash; the verdict will land here when quorum
        is reached.
      </p>
    </section>
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

// ─────────────────────────────────────────────────────────────────────
// CaseFileSkeleton — loading state. Mirrors the case-file skeleton so
// the layout doesn't shift on hydration.
// ─────────────────────────────────────────────────────────────────────

function CaseFileSkeleton() {
  return (
    <div aria-busy="true" className="mt-10">
      <p className="bcc-mono text-cardstock-deep">PULLING FILE…</p>
      <div className="mt-6 h-32 w-2/3 bg-ink/5" />
      <div className="mt-4 h-6 w-3/4 bg-ink/5" />
      <div className="mt-12 grid gap-10 md:grid-cols-[1fr_minmax(320px,400px)] md:gap-12">
        <div className="flex flex-col gap-6">
          <div className="h-5 w-24 bg-ink/5" />
          <div className="h-24 w-full bg-ink/5" />
          <div className="h-24 w-full bg-ink/5" />
        </div>
        <div className="h-64 w-full bg-ink/5" />
      </div>
    </div>
  );
}

function CaseFileError({ message }: { message: string }) {
  return (
    <div className="mt-10 border-2 border-safety p-6">
      <p className="bcc-mono text-safety">CASE FILE ERROR //</p>
      <p className="bcc-stencil mt-2 text-2xl text-ink">
        Couldn&rsquo;t pull the case.
      </p>
      <p role="alert" className="bcc-mono mt-3 text-ink-ghost">
        {message}
      </p>
    </div>
  );
}

function CaseFileMissing({ id }: { id: number }) {
  return (
    <div className="mt-10 border-2 border-ink/30 p-6">
      <p className="bcc-mono text-cardstock-deep">NOT IN YOUR FILES //</p>
      <p className="bcc-stencil mt-2 text-3xl text-ink">
        Case №{id} isn&rsquo;t on your floor.
      </p>
      <p
        className="mt-3 font-serif text-ink-soft"
        style={{ fontSize: "15px", lineHeight: 1.55 }}
      >
        Either it never landed in your panel duty queue, you didn&rsquo;t
        file it, or the dispute closed and rolled off your active list.
        The detail surface only mirrors what your two queues already hold.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// formatRelativeUTC / formatAbsoluteUTC — local helpers. The relative
// version is intentionally duplicated from PanelQueue/MyDisputesList
// per the comment in MyDisputesList.tsx — exporting from the other
// file would couple two surfaces that don't otherwise depend on each
// other. Same UTC-stable semantics so SSR matches client.
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

function formatAbsoluteUTC(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  })
    .format(new Date(t))
    .toUpperCase()
    .concat(" UTC");
}

function creditExplanation(
  credited: boolean,
  reason: CastPanelVoteResponse["participation"]["reason"],
): string {
  if (credited) {
    return "Your accuracy is scored once the panel reaches a verdict. Correct calls add weight to your trust score; mis-calls don't penalize.";
  }
  switch (reason) {
    case "daily_cap":
      return "You've hit the daily trust cap from panel duty. Your vote still counts toward the verdict — credits resume tomorrow.";
    case "total_cap":
      return "You've earned the lifetime trust maximum from panel duty. Your vote still counts toward the verdict.";
    case "suspended":
      return "Account is currently suspended. Your vote is on file but not credited.";
    case "fraud_flag":
      return "Account is under risk review. Your vote is on file but not credited until the review clears.";
    case "linked_users":
      return "Anti-abuse heuristic blocked this credit. Your vote still counts toward the verdict.";
    case "low_quality":
      return "This dispute was flagged as low-quality. Your vote stands but no credit is applied.";
    case "already_recorded":
      return "We already had a participation row for this dispute. Your vote stands.";
    case "service_unavailable":
    case null:
      return "Credit recording hit a transient error. Your vote stands; ops will reconcile if needed.";
  }
}

function humanizeError(err: unknown): string {
  if (err instanceof BccApiError) {
    switch (err.code) {
      case "bcc_unauthorized":
        return "Sign in first.";
      case "not_assigned":
        return "You're not on this dispute's panel.";
      case "already_voted":
        return "You've already voted on this one.";
      case "invalid_decision":
        return "Pick accept or reject.";
      case "dispute_closed":
        return "This dispute resolved before your vote landed.";
      default:
        return err.message || "Couldn't record your vote. Try again.";
    }
  }
  return "Something went wrong. Try again.";
}
