/**
 * LivingHeader — §O3 "the profile is alive."
 *
 * Renders the locked §2.4 LivingBlock plus, optionally, a rank-progress
 * slot from the §2.5 ProgressionBlock when one is supplied.
 *
 * What appears (left → right):
 *
 *   1. Today's impact line — composed from `living.today` non-zero
 *      counters (per §O3: zero values returned by the server are
 *      filtered before rendering). Falls back to a neutral "quiet
 *      shift" line when nothing has happened today, AND a §O3.1
 *      comparison sub-line when the server populated one.
 *
 *   2. Progression slot — own-only (§3.1). Branches on the Phase 5
 *      §2.5 union:
 *        ranked + next rung  → phosphor rank-score bar toward
 *                              `next_threshold` (server numbers; the
 *                              percent width is the only client math).
 *        ranked, terminal    → rank label + quiet status caption (a
 *                              saturated 100% bar reads as "done" and
 *                              discourages the next action).
 *        new_member          → compact §5.1 readiness checklist,
 *                              neutral-imperative copy.
 *        legacy/absent shape → the slot collapses entirely (C8 — an old
 *                              backend's progression matches neither
 *                              discriminant; render nothing, never
 *                              fabricate).
 *
 * Server-supplied per §A2 — this component renders, never derives
 * scores or status. The percent number is presentation-only (CSS width)
 * so it doesn't qualify as business logic.
 *
 * Sprint 2 constitutional revision (2026-05-13): the streak column
 * (FlameMark + day counter + STREAK label + at-risk pulse) has been
 * removed. Streaks reward frequency and import behavioural-treadmill
 * psychology into a platform whose currency is durable judgment.
 */

import { StatusTick } from "@/components/profile/StatusTick";
import type { MemberLiving, MemberProgression, MemberReadiness } from "@/lib/api/types";

interface LivingHeaderProps {
  living: MemberLiving;
  /**
   * Own-profile only. Renders the progression slot when supplied; the
   * slot collapses when omitted (others' profiles) or when the payload
   * matches neither Phase 5 discriminant (old backend).
   */
  progression?: MemberProgression | undefined;
  /**
   * Sprint 4 cohesion: when true, the "Quiet shift. Floor's been still."
   * fallback line is suppressed entirely (the today paragraph
   * collapses). FloorBriefing sets this on the home page so the
   * empty-state stack — FloorBriefing greeting → DiscoverPanel
   * "Quiet on the Floor" headline → DiscoverPanel kicker — doesn't
   * pile three "quiet" signals on top of each other. Profile-page
   * callers leave it undefined so the fallback still surfaces there
   * (where it carries observational meaning rather than redundancy).
   */
  hideEmptyShiftFallback?: boolean | undefined;
}

export function LivingHeader({ living, progression, hideEmptyShiftFallback }: LivingHeaderProps) {
  const todayLine = composeTodayLine(living.today, hideEmptyShiftFallback === true);

  // Phase 5 union narrowing — doubles as the old-backend guard: a
  // legacy progression payload carries no member_state, matches neither
  // arm, and the slot collapses.
  const ranked =
    progression !== undefined && progression.member_state === "ranked"
      ? progression
      : null;
  const newMember =
    progression !== undefined && progression.member_state === "new_member"
      ? progression
      : null;

  // Terminal-state detection: no next rung ahead (top of the earned
  // ladder) — there is no honest percentage to render.
  const terminal =
    ranked !== null &&
    (ranked.next_rank === null || ranked.next_threshold === null);
  const pct =
    ranked !== null && !terminal && ranked.next_threshold !== null
      ? clampPct(ranked.rank_score, ranked.next_threshold)
      : 0;

  const hasRightSlot = ranked !== null || newMember !== null;

  return (
    <section
      aria-label="Member activity at a glance"
      className={
        "bcc-stage-reveal grid grid-cols-1 gap-4 " +
        (hasRightSlot ? "md:grid-cols-[1fr_auto] md:gap-8" : "")
      }
      style={{ ["--stagger" as string]: "120ms" }}
    >
      {/* Today's impact + §O3.1 comparison — stacked editorial lines.
          cadence-pressure-guard:allow — this comment documents the
          REMOVAL of the streak column that used to occupy the left slot
          (Sprint 2 — see component docstring). The "today"
          line is now the primary acknowledgment surface. */}
      <div className="flex flex-col justify-center gap-1">
        {todayLine !== "" && (
          <p className="font-serif text-base italic text-bcc-text-secondary md:text-lg">
            {todayLine}
          </p>
        )}
        {/* §O3.1 social comparison ("Top 5% this week"). A statistic, not a
            trust state — nothing here is earned, verified or live, so it
            takes primary text rather than a semantic colour. */}
        {living.comparison !== null && (
          <p className="bcc-mono text-[11px] tracking-[0.18em] text-bcc-text">
            {living.comparison.headline.toUpperCase()}
          </p>
        )}
      </div>

      {/* Ranked, terminal — rank visible, no saturated bar (a 100% bar
          reads as "max level reached" and discourages the next action). */}
      {ranked !== null && terminal && (
        <div className="w-full sm:min-w-[260px] md:max-w-[320px]">
          <div className="bcc-mono mb-1 flex items-baseline justify-between text-bcc-text-secondary">
            <span className="text-bcc-text">
              {(ranked.rank_label ?? ranked.rank).toUpperCase()}
            </span>
          </div>
          <p className="bcc-mono text-bcc-text-secondary">
            Top of the earned ladder.
          </p>
        </div>
      )}

      {/* Ranked, next rung ahead — rank-score bar toward next_threshold. */}
      {ranked !== null && !terminal && (
        <div className="w-full sm:min-w-[260px] md:max-w-[320px]">
          <div className="bcc-mono mb-1 flex items-baseline justify-between text-bcc-text-secondary">
            <span>
              <span className="text-bcc-text">
                {(ranked.rank_label ?? ranked.rank).toUpperCase()}
              </span>
              {ranked.next_rank_label !== null && (
                <>
                  {/* The arrow carries "next"; the colour does not need to.
                      Secondary keeps current > next in the hierarchy. */}
                  <span className="mx-2 text-bcc-text-secondary">→</span>
                  <span className="text-bcc-text-secondary">
                    {ranked.next_rank_label.toUpperCase()}
                  </span>
                </>
              )}
            </span>
            {/* A value readout, so primary text. */}
            <span className="text-bcc-text">{pct}%</span>
          </div>
          <div className="relative h-3 border border-cardstock/25 bg-concrete-hi">
            {/* Phosphor fill */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, var(--verified), var(--phosphor))",
                boxShadow: "0 0 8px rgb(var(--phosphor-rgb) / 0.6)",
              }}
            />
            {/* Striped track over unfilled portion */}
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 opacity-30"
              style={{
                width: `${100 - pct}%`,
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 6px, rgb(var(--cardstock-rgb) / 0.15) 6px 7px)",
              }}
            />
          </div>
          <p className="bcc-mono mt-1 text-bcc-text-secondary">
            Rank score {ranked.rank_score} of {ranked.next_threshold}
          </p>
        </div>
      )}

      {/* New Member — compact readiness checklist (§5.1). Explicit
          member_state only; copy is neutral-imperative per §2.7. */}
      {newMember !== null && (
        <div className="w-full sm:min-w-[260px] md:max-w-[320px]">
          <div className="bcc-mono mb-1 text-bcc-text-secondary">
            <span className="text-bcc-text">GETTING STARTED</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {readinessRows(newMember.readiness).map((row) => (
              <li key={row.label} className="bcc-mono flex items-baseline gap-2">
                <StatusTick done={row.done} sizeClass="" />
                <span
                  className={row.done ? "text-bcc-text-secondary" : "text-bcc-text"}
                >
                  {row.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Compose the "what happened today" line from non-zero living.today
// counts. Server returns all five counters; per §O3 we filter zeros
// and join the remainder with " · " separators, plain English plurals.
// Empty case falls back to the neutral "quiet shift" copy.
// ─────────────────────────────────────────────────────────────────────

export function composeTodayLine(today: MemberLiving["today"], hideEmptyFallback: boolean): string {
  const parts: string[] = [];
  pushIf(parts, today.reviews,                  (n) => `${n} ${pluralize(n, "review", "reviews")}`);
  pushIf(parts, today.solids_received,          (n) => `${n} ${pluralize(n, "solid", "solids")}`);
  // vouches_received and pulls are optional on the §3.1 contract;
  // missing counters are treated as zero (filtered out by pushIf).
  // The server enum is still `pulls` (storage primitive); the user-
  // visible noun is `card watched` / `cards watched` per the
  // Keep Tabs migration.
  pushIf(parts, today.vouches_received ?? 0,    (n) => `${n} ${pluralize(n, "vouch", "vouches")}`);
  pushIf(parts, today.disputes_signed,          (n) => `${n} ${pluralize(n, "dispute signed", "disputes signed")}`);
  pushIf(parts, today.pulls ?? 0,               (n) => `${n} ${pluralize(n, "card watched", "cards watched")}`);

  if (parts.length === 0) {
    // Sprint 4: FloorBriefing on the home page passes hideEmptyFallback
    // so the DiscoverPanel "Quiet on the Floor" headline isn't shadowed
    // by a redundant "Quiet shift" line above it. Profile-page callers
    // leave the flag off and still see the observational fallback.
    return hideEmptyFallback ? "" : "Quiet shift. Floor's been still.";
  }
  // "Today: 2 reviews · 14 solids · 3 vouches"
  return `Today: ${parts.join(" · ")}.`;
}

function pushIf(parts: string[], n: number, fmt: (n: number) => string): void {
  if (n > 0) parts.push(fmt(n));
}

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

// ─────────────────────────────────────────────────────────────────────
// Progression helpers — pure presentation. Percent is
// rank_score / next_threshold clamped 0–100; readiness rows map the
// three §5.1 booleans to compact checklist lines (no timers, no
// countdowns — the 24h confirmation detail lives on /me/progression).
// ─────────────────────────────────────────────────────────────────────

function clampPct(current: number, target: number): number {
  if (target <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function readinessRows(
  readiness: MemberReadiness,
): Array<{ label: string; done: boolean }> {
  return [
    { label: "Set up your profile", done: readiness.profile_setup },
    { label: "Verify your identity", done: readiness.verified_identity },
    {
      label: "Post or comment to get started",
      done: readiness.qualifying_contribution,
    },
  ];
}

// FlameMark removed in Sprint 2 — the streak surface it served was
// retired per the constitutional motion policy (streaks import
// behavioural-treadmill psychology). The SVG itself was well-crafted;
// if a future surface needs an iconographic flame for a different
// purpose, lift it from git history (this file pre-2026-05-13).
