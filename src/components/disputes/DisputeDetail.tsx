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
 *
 * Phase 3.3 split: this file keeps the cache-resolution shell + the
 * CaseFile composition; the panels live in sibling modules
 * (CaseFileChrome / CaseHeader / CaseBody / TallyPanel / YourCallPanel).
 */

import {
  useMyDisputes,
  useMyParticipation,
  usePanelQueue,
} from "@/hooks/useDisputes";
import {
  type MyParticipationStatus,
  type PanelDispute,
} from "@/lib/api/types";

import { CaseBody } from "./CaseBody";
import {
  CaseFileChrome,
  CaseFileError,
  CaseFileMissing,
  CaseFileSkeleton,
} from "./CaseFileChrome";
import { CaseHeader } from "./CaseHeader";
import { TallyPanel } from "./TallyPanel";
import { ReporterWaiting, YourCallPanel } from "./YourCallPanel";

export type Source = "panel" | "filed";

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
