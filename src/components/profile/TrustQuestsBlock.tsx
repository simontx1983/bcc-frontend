/**
 * TrustQuestsBlock — the §N11 quest checklist and the vote-weight multiplier
 * it earns, shown as FILE 06 on /me/progression (via StandingFileBody).
 *
 * All values are server-rendered; this component only formats and never
 * derives trust. Copy is descriptive per §2.7 — no prescriptive "complete
 * these" nudge. Per-quest actions (e.g. Share on X) are injected by the parent
 * through `renderAction` so this stays a pure, dependency-light presentational
 * component (kept in its own file so its test doesn't drag in the API layer).
 */

import type { MemberQuestItem, MemberQuestProgress } from "@/lib/api/types";

export function TrustQuestsBlock({
  quests,
  renderAction,
}: {
  quests: MemberQuestProgress;
  /** Optional per-quest action (e.g. Share on X). Only shown while pending. */
  renderAction?: (quest: MemberQuestItem) => React.ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, quests.pct));

  return (
    <div className="flex flex-col gap-6">
      <p className="font-serif text-base leading-relaxed text-cardstock-deep max-w-prose">
        Each of these one-time steps folds a little weight into your votes.
        Finished steps are already counted in the multiplier below — the rest
        are here whenever you get to them.
      </p>

      <div className="bcc-panel flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <span className="bcc-mono text-[10px] tracking-[0.2em] text-ink-soft">
              YOUR VOTE MULTIPLIER
            </span>
            <span className="bcc-stencil text-4xl leading-none text-ink">
              {quests.multiplier.toFixed(2)}×
            </span>
          </div>
          <span className="bcc-mono text-ink-soft">
            <span className="text-ink">{quests.completed_count}</span>
            <span className="mx-1 text-ink-ghost">/</span>
            {quests.total_count} steps folded in
          </span>
        </div>
        <div className="relative h-3 border border-cardstock/25 bg-concrete-hi">
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: `${pct}%`,
              background:
                "linear-gradient(90deg, var(--verified), var(--phosphor))",
              boxShadow: "0 0 8px rgb(var(--phosphor-rgb) / 0.6)",
            }}
          />
        </div>
      </div>

      <ul className="flex flex-col">
        {quests.items.map((quest) => (
          <li
            key={quest.slug}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-dashed border-cardstock/15 py-3 last:border-b-0"
          >
            <span
              aria-hidden
              className={
                "bcc-mono text-lg leading-none " +
                (quest.done ? "text-phosphor" : "text-ink-ghost")
              }
            >
              {quest.done ? "✓" : "○"}
            </span>
            <span className="flex flex-col">
              <span className="bcc-mono text-cardstock">
                {quest.label.toUpperCase()}
              </span>
              <span className="font-serif text-sm text-cardstock-deep">
                {quest.hint}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <span
                className={
                  "bcc-mono whitespace-nowrap " +
                  (quest.done ? "text-phosphor" : "text-cardstock-deep")
                }
              >
                +{quest.weight_bonus.toFixed(2)}×
              </span>
              {!quest.done && renderAction?.(quest)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
