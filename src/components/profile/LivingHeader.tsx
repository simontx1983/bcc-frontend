/**
 * LivingHeader — §O3 "the profile is alive."
 *
 * Renders the locked §2.4 LivingBlock plus, optionally, a rank-progress
 * bar from the §2.5 ProgressionBlock when one is supplied.
 *
 * What appears (left → right):
 *
 *   1. Today's impact line — composed from `living.today` non-zero
 *      counters (per §O3: zero values returned by the server are
 *      filtered before rendering). Falls back to a neutral "quiet
 *      shift" line when nothing has happened today, AND a §O3.1
 *      comparison sub-line when the server populated one.
 *
 *   2. Rank progression — phosphor-fill bar with a "next rank" label.
 *      ONLY rendered when a `progression` prop is supplied (own-only
 *      profiles per §3.1). Server is the source of truth on the
 *      thresholds — this component computes one number: the percent
 *      width, derived from `current / required` of the leading metric.
 *
 * Server-supplied per §A2 — this component renders, never derives
 * scores or status. The percent number is presentation-only (CSS width)
 * so it doesn't qualify as business logic.
 *
 * Sprint 2 constitutional revision (2026-05-13): the streak column
 * (FlameMark + day counter + STREAK label + at-risk pulse) has been
 * removed. Streaks reward frequency and import behavioural-treadmill
 * psychology into a platform whose currency is durable judgment. The
 * "today" line + "Quiet shift. Floor's been still." fallback now
 * carry the room-acknowledges-the-operator signal on their own. The
 * `living.streak_days` and `living.streak_at_risk_today` fields stay
 * on the view-model (backward compatibility); the FE just stops
 * reading them. Backend cleanup of the streak computation is a
 * follow-up.
 */

import type { MemberLiving, MemberProgression } from "@/lib/api/types";

interface LivingHeaderProps {
  living: MemberLiving;
  /**
   * Own-profile only. Renders the rank-progress bar in the right slot
   * when supplied; the slot collapses when omitted (others' profiles).
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
  const showProgression = progression !== undefined && progression !== null;
  // Terminal-state detection: user has no auto-promotion target ahead
  // of them. Either they're already at the top of the auto-ladder
  // (Foreman, or any future top rank) OR the next rank is admin-
  // conferred so there's no honest percentage to render.
  //
  // Phase γ retention pass (2026-05-13): the smoke test showed
  // "JOURNEYMAN · 100%" on the home FloorBriefing for new-default
  // users, which reads as "max level reached" — discouraging the
  // first action. When terminal, render the rank chip with a quiet
  // status caption instead of a saturated bar.
  const terminal =
    showProgression &&
    progression !== undefined &&
    (progression.next_rank === null ||
      progression.next_rank_thresholds.length === 0);
  const pct = showProgression && !terminal
    ? leadingThresholdPercent(progression)
    : 0;
  const remainingLabel = showProgression
    ? composeRemainingLabel(progression)
    : null;

  return (
    <section
      aria-label="Member activity at a glance"
      className={
        "bcc-stage-reveal grid grid-cols-1 gap-4 " +
        (showProgression ? "md:grid-cols-[1fr_auto] md:gap-8" : "")
      }
      style={{ ["--stagger" as string]: "120ms" }}
    >
      {/* Today's impact + §O3.1 comparison — stacked editorial lines.
          The streak column that used to occupy the left slot has been
          removed (Sprint 2 — see component docstring). The "today"
          line is now the primary acknowledgment surface. */}
      <div className="flex flex-col justify-center gap-1">
        {todayLine !== "" && (
          <p className="font-serif text-base italic text-cardstock-deep md:text-lg">
            {todayLine}
          </p>
        )}
        {living.comparison !== null && (
          <p className="bcc-mono text-[11px] tracking-[0.18em] text-phosphor">
            {living.comparison.headline.toUpperCase()}
          </p>
        )}
      </div>

      {/* Rank progress — phosphor bar with ribboned end-cap. Own only.
          Terminal-state branch suppresses the progress bar entirely and
          renders just the rank chip + status caption. Rationale: a 100%
          bar next to a rank chip reads as "max level reached" — which
          discourages new users from doing anything, since the cue tells
          them they're already done. The terminal branch keeps the rank
          visible and replaces the saturated bar with a status line
          telling them what's next (admin-conferred, or top of ladder). */}
      {showProgression && progression !== undefined && terminal && (
        <div className="w-full sm:min-w-[260px] md:max-w-[320px]">
          <div className="bcc-mono mb-1 flex items-baseline justify-between text-cardstock-deep">
            <span>
              <span className="text-cardstock">{progression.current_rank_label.toUpperCase()}</span>
              {progression.next_rank_label !== null && (
                <>
                  <span className="mx-2 text-ink-ghost">→</span>
                  <span className="text-ink-ghost">{progression.next_rank_label.toUpperCase()}</span>
                </>
              )}
            </span>
          </div>
          {/* Terminal status caption — quiet, intentional, civic. Falls
              back to a default when the server didn't ship a remaining
              label (defensive against contract softening). */}
          <p className="bcc-mono text-ink-ghost">
            {remainingLabel ?? (
              progression.next_rank === null
                ? "Top of the auto-ladder."
                : "Auto-promotion ladder complete."
            )}
          </p>
        </div>
      )}
      {showProgression && progression !== undefined && !terminal && (
        <div className="w-full sm:min-w-[260px] md:max-w-[320px]">
          <div className="bcc-mono mb-1 flex items-baseline justify-between text-cardstock-deep">
            <span>
              <span className="text-cardstock">{progression.current_rank_label.toUpperCase()}</span>
              {progression.next_rank_label !== null && (
                <>
                  <span className="mx-2 text-ink-ghost">→</span>
                  <span className="bcc-phosphor-text">{progression.next_rank_label.toUpperCase()}</span>
                </>
              )}
            </span>
            <span className="bcc-phosphor-text">{pct}%</span>
          </div>
          <div className="relative h-3 border border-cardstock/25 bg-concrete-hi">
            {/* Phosphor fill */}
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(90deg, var(--verified), var(--phosphor))",
                boxShadow: "0 0 8px rgba(125, 255, 154, 0.6)",
              }}
            />
            {/* Striped track over unfilled portion */}
            <div
              aria-hidden
              className="absolute inset-y-0 right-0 opacity-30"
              style={{
                width: `${100 - pct}%`,
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent 0 6px, rgba(239,229,207,0.15) 6px 7px)",
              }}
            />
          </div>
          {remainingLabel !== null && (
            <p className="bcc-mono mt-1 text-ink-ghost">{remainingLabel}</p>
          )}
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

function composeTodayLine(today: MemberLiving["today"], hideEmptyFallback: boolean): string {
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
// Progression helpers — pure presentation. The "leading threshold" is
// the first metric in next_rank_thresholds; that's where the user is
// closest to advancing. Percent is current / required clamped 0–100.
// ─────────────────────────────────────────────────────────────────────

function leadingThresholdPercent(progression: MemberProgression): number {
  const first = progression.next_rank_thresholds[0];
  if (first === undefined || first.required <= 0) {
    // No thresholds (top of ladder) — treat as 100%.
    return 100;
  }
  const raw = (first.current / first.required) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function composeRemainingLabel(progression: MemberProgression): string | null {
  const first = progression.next_rank_thresholds[0];
  if (first === undefined) return null;
  const remaining = Math.max(0, first.required - first.current);
  if (remaining === 0) return "Threshold reached.";
  return `${remaining} ${first.label.toLowerCase()} to go`;
}

// FlameMark removed in Sprint 2 — the streak surface it served was
// retired per the constitutional motion policy (streaks import
// behavioural-treadmill psychology). The SVG itself was well-crafted;
// if a future surface needs an iconographic flame for a different
// purpose, lift it from git history (this file pre-2026-05-13).
