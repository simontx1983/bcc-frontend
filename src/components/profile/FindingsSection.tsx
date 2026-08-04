"use client";

/**
 * FindingsSection — the §15 own-view findings list (Rank Phase 8),
 * rendered by StandingFileBody when the progression block carries a
 * non-empty `findings` array. OWN VIEW ONLY by construction (§22.3):
 * `findings` ships solely on the self-scoped progression block, so
 * this component can never see another member's file.
 *
 * Per finding: severity chip (semantic status tokens — no hardcoded
 * colors), humanized type, the penalty line, the ceiling line when a
 * rank cap is in force, and the status / appeal line. An active,
 * never-appealed finding offers the once-only "Request review" action
 * (§15.5) behind a confirm; every post-request state renders as plain
 * text. Reversed findings (the 30-day own-view tail) render quiet and
 * struck-through — §E2: negative events never celebrate OR shame.
 *
 * All verdicts, penalties, and dates are server-computed; the only
 * client work here is label formatting. Dates render as the wire's
 * UTC values (same treatment as the recovery deadline) — no locale
 * math, no hydration drift.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useRequestFindingAppealMutation } from "@/hooks/useFindingAppeal";
import { humanizeCode, isCode } from "@/lib/api/errors";
import type {
  RankFinding,
  RankFindingAppealStatus,
  RankFindingSeverity,
} from "@/lib/api/types";

// Semantic status tokens per severity — presentation mapping, not a
// derivation (severity itself is server-assigned).
const SEVERITY_COLOR: Record<RankFindingSeverity, string> = {
  minor: "var(--bcc-text-muted)",
  moderate: "var(--bcc-warning)",
  serious: "var(--bcc-danger)",
  severe: "var(--bcc-danger)",
};

/** "coordinated_voting" → "Coordinated voting". Formatting only. */
function humanizeSlug(slug: string): string {
  const words = slug.replace(/_/g, " ").trim();
  if (words === "") return slug;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Post-request appeal states render as plain text (§15.5). */
const APPEAL_STATE_COPY: Record<
  Exclude<RankFindingAppealStatus, "">,
  string
> = {
  requested: "Review requested.",
  upheld: "Reviewed — upheld.",
  reduced: "Reviewed — penalty reduced.",
  reversed: "Reviewed — reversed.",
  remanded: "Reviewed — sent back for further review.",
};

export function FindingsSection({ findings }: { findings: RankFinding[] }) {
  const router = useRouter();
  const mutation = useRequestFindingAppealMutation();

  // Immediate local echo of a successful request — the server truth
  // arrives via router.refresh(), but the button should flip to
  // "Review requested." without waiting for the round-trip.
  const [requestedIds, setRequestedIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [rowError, setRowError] = useState<{
    id: number;
    message: string;
  } | null>(null);

  const handleRequest = (finding: RankFinding) => {
    if (mutation.isPending) return;
    const ok = window.confirm("You can request one review per finding.");
    if (!ok) return;
    setRowError(null);
    mutation.mutate(finding.id, {
      onSuccess: () => {
        setRequestedIds((prev) => new Set(prev).add(finding.id));
        router.refresh();
      },
      onError: (err) => {
        if (isCode(err, "bcc_conflict")) {
          // Already requested or already decided — reflect the
          // requested state locally and pull server truth.
          setRequestedIds((prev) => new Set(prev).add(finding.id));
          setRowError({
            id: finding.id,
            message: "A review was already requested.",
          });
          router.refresh();
          return;
        }
        setRowError({
          id: finding.id,
          message: humanizeCode(
            err,
            {
              bcc_unauthorized: "Sign in to request a review.",
              bcc_not_found: "This finding is no longer on file. Refresh the page.",
              bcc_rate_limited: "Too many requests — try again in a little while.",
            },
            "Couldn't request the review. Try again.",
          ),
        });
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="font-serif text-base leading-relaxed text-bcc-text-secondary max-w-prose">
        Formal findings on your file, and what each one currently does
        to your standing. Every finding can be sent for one review;
        reversed findings restore the score they held back.
      </p>
      <ul className="flex flex-col gap-3">
        {findings.map((finding) => {
          const reversed = finding.status === "reversed";
          const locallyRequested = requestedIds.has(finding.id);
          const appealState: RankFindingAppealStatus = locallyRequested
            ? "requested"
            : finding.appeal_status;
          const canRequest =
            !reversed && appealState === "" && !locallyRequested;
          const appealCopy =
            appealState === "" ? undefined : APPEAL_STATE_COPY[appealState];
          const pending =
            mutation.isPending && mutation.variables === finding.id;

          return (
            <li
              key={finding.id}
              className={
                "bcc-panel flex flex-col gap-2 p-4" +
                (reversed ? " opacity-60" : "")
              }
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <span
                  className="bcc-mono border px-2 py-0.5 text-[10px] tracking-[0.2em]"
                  style={{
                    color: SEVERITY_COLOR[finding.severity] ?? "var(--bcc-text-muted)",
                    borderColor:
                      SEVERITY_COLOR[finding.severity] ?? "var(--bcc-text-muted)",
                  }}
                >
                  {finding.severity.toUpperCase()}
                </span>
                <span
                  className={
                    "bcc-mono text-bcc-text" + (reversed ? " line-through" : "")
                  }
                >
                  {humanizeSlug(finding.type).toUpperCase()}
                </span>
                {finding.created_at !== "" && (
                  <span className="bcc-mono text-bcc-text-muted">
                    On file {finding.created_at} (UTC)
                  </span>
                )}
              </div>

              {reversed ? (
                <p className="bcc-mono text-bcc-text-secondary">
                  Reversed — score restored.
                </p>
              ) : (
                <>
                  <p className="bcc-mono text-bcc-text-secondary">
                    −{finding.score_penalty} rank score until{" "}
                    <span className="text-bcc-text">
                      {finding.penalty_expires_at}
                    </span>{" "}
                    (UTC)
                  </p>
                  {finding.ceiling_rank !== null && (
                    <p className="bcc-mono text-bcc-text-secondary">
                      Rank capped at {humanizeSlug(finding.ceiling_rank)}
                      {finding.ceiling_expires_at !== null && (
                        <>
                          {" "}
                          until{" "}
                          <span className="text-bcc-text">
                            {finding.ceiling_expires_at}
                          </span>{" "}
                          (UTC)
                        </>
                      )}
                    </p>
                  )}
                  <div className="flex flex-wrap items-baseline gap-3">
                    {canRequest ? (
                      <button
                        type="button"
                        onClick={() => handleRequest(finding)}
                        disabled={mutation.isPending}
                        className="bcc-mono text-safety hover:underline underline-offset-4 disabled:cursor-not-allowed disabled:text-bcc-text-muted"
                      >
                        {pending ? "Requesting…" : "Request review →"}
                      </button>
                    ) : (
                      appealCopy !== undefined && (
                        <span className="bcc-mono text-bcc-text-secondary">
                          {appealCopy}
                        </span>
                      )
                    )}
                    {rowError !== null && rowError.id === finding.id && (
                      <span role="alert" className="bcc-mono text-safety">
                        {rowError.message}
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
