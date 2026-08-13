/**
 * TrustQuestsBlock — the quest checklist, shown as its own FILE section
 * on /me/progression (via StandingFileBody).
 *
 * D-1 (Rank redesign): quests are onboarding guidance / floor
 * achievements and grant NO Rank, Trust, or voting power. The legacy
 * vote-weight multiplier and per-quest weight bonuses are gone from the
 * wire and from this surface — never reintroduce "boosts your vote
 * weight" copy here.
 *
 * All values are server-rendered; this component only formats and never
 * derives trust. Copy is descriptive per §2.7 — no prescriptive
 * "complete these" nudge. Per-quest actions (e.g. Share on X) are
 * injected by the parent through `renderAction` so this stays a pure,
 * dependency-light presentational component (kept in its own file so
 * its test doesn't drag in the API layer).
 */

import { StatusTick } from "@/components/profile/StatusTick";
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
      <p className="font-serif text-base leading-relaxed text-bcc-text-secondary max-w-prose">
        One-time steps for learning your way around the floor. They
        don&rsquo;t move your rank or your trust tier — finished ones
        stay on the books, the rest are here whenever you get to them.
      </p>

      <div className="bcc-panel flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col">
            <span className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
              STEPS COMPLETE
            </span>
            <span className="bcc-stencil text-4xl leading-none text-bcc-text">
              {quests.completed_count}
              <span className="text-bcc-text-secondary">/</span>
              {quests.total_count}
            </span>
          </div>
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
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-dashed border-bcc-border py-3 last:border-b-0"
          >
            <StatusTick done={quest.done} />
            <span className="flex flex-col">
              <span className="bcc-mono text-bcc-text">
                {quest.label.toUpperCase()}
              </span>
              <span className="font-serif text-sm text-bcc-text-secondary">
                {quest.hint}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              {!quest.done && renderAction?.(quest)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
