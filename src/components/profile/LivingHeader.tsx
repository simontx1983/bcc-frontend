/**
 * LivingHeader — §O3 "the profile is alive."
 *
 * Renders the locked §2.4 LivingBlock plus, optionally, a rank-progress
 * bar from the §2.5 ProgressionBlock when one is supplied.
 *
 * What appears (left → right):
 *
 *   1. Streak counter — flame icon + "47-DAY STREAK" stencil readout.
 *      Pulled from `living.streak_days`. The `streak_at_risk_today`
 *      flag promotes the readout to a soft warning tone.
 *
 *   2. Today's impact line — composed from `living.today` non-zero
 *      counters (per §O3: zero values returned by the server are
 *      filtered before rendering). Falls back to a neutral "quiet
 *      shift" line when nothing has happened today, AND a §O3.1
 *      comparison sub-line when the server populated one.
 *
 *   3. Rank progression — phosphor-fill bar with a "next rank" label.
 *      ONLY rendered when a `progression` prop is supplied (own-only
 *      profiles per §3.1). Server is the source of truth on the
 *      thresholds — this component computes one number: the percent
 *      width, derived from `current / required` of the leading metric.
 *
 * Server-supplied per §A2 — this component renders, never derives
 * scores or status. The percent number is presentation-only (CSS width)
 * so it doesn't qualify as business logic.
 */

import type { MemberLiving, MemberProgression } from "@/lib/api/types";

interface LivingHeaderProps {
  living: MemberLiving;
  /**
   * Own-profile only. Renders the rank-progress bar in the right slot
   * when supplied; the slot collapses when omitted (others' profiles).
   */
  progression?: MemberProgression | undefined;
}

export function LivingHeader({ living, progression }: LivingHeaderProps) {
  const todayLine = composeTodayLine(living.today);
  const showProgression = progression !== undefined && progression !== null;
  const pct = showProgression ? leadingThresholdPercent(progression) : 0;
  const remainingLabel = showProgression
    ? composeRemainingLabel(progression)
    : null;

  return (
    <section
      aria-label="Member activity at a glance"
      className={
        "bcc-stage-reveal grid grid-cols-1 gap-4 " +
        (showProgression ? "md:grid-cols-[auto_1fr_auto] md:gap-8" : "md:grid-cols-[auto_1fr] md:gap-8")
      }
      style={{ ["--stagger" as string]: "120ms" }}
    >
      {/* Streak — flame mark + day count + label.
          `streak_at_risk_today` is optional on the §3.1 contract;
          missing = "not at risk" (the conservative default). */}
      <div className="flex items-center gap-3 border-l-[3px] border-safety pl-4">
        <FlameMark atRisk={living.streak_at_risk_today ?? false} />
        <div className="leading-none">
          <div className="bcc-stencil text-cardstock text-3xl">
            {living.streak_days}
            <span className="text-ink-ghost ml-1 text-base">D</span>
          </div>
          <div
            className={
              living.streak_at_risk_today === true
                ? "bcc-mono mt-1 text-weld"
                : "bcc-mono mt-1 text-safety"
            }
          >
            {living.streak_at_risk_today === true ? "STREAK · AT RISK" : "STREAK"}
          </div>
        </div>
      </div>

      {/* Today's impact + §O3.1 comparison — stacked editorial lines */}
      <div className="flex flex-col justify-center gap-1">
        <p className="font-serif text-base italic text-cardstock-deep md:text-lg">
          {todayLine}
        </p>
        {living.comparison !== null && (
          <p className="bcc-mono text-[11px] tracking-[0.18em] text-phosphor">
            {living.comparison.headline.toUpperCase()}
          </p>
        )}
      </div>

      {/* Rank progress — phosphor bar with ribboned end-cap. Own only. */}
      {showProgression && progression !== undefined && (
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

function composeTodayLine(today: MemberLiving["today"]): string {
  const parts: string[] = [];
  pushIf(parts, today.reviews,                  (n) => `${n} ${pluralize(n, "review", "reviews")}`);
  pushIf(parts, today.solids_received,          (n) => `${n} ${pluralize(n, "solid", "solids")}`);
  // vouches_received and pulls are optional on the §3.1 contract;
  // missing counters are treated as zero (filtered out by pushIf).
  pushIf(parts, today.vouches_received ?? 0,    (n) => `${n} ${pluralize(n, "vouch", "vouches")}`);
  pushIf(parts, today.disputes_signed,          (n) => `${n} ${pluralize(n, "dispute signed", "disputes signed")}`);
  pushIf(parts, today.pulls ?? 0,               (n) => `${n} ${pluralize(n, "pull", "pulls")}`);

  if (parts.length === 0) {
    return "Quiet shift. Floor's been still.";
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

// ─────────────────────────────────────────────────────────────────────
// FlameMark — crisp SVG flame in safety-orange. Drops to a dimmer tone
// when the streak is at risk today, so the icon carries the warning.
// ─────────────────────────────────────────────────────────────────────

function FlameMark({ atRisk }: { atRisk: boolean }) {
  return (
    <svg
      aria-hidden
      width="40"
      height="40"
      viewBox="0 0 40 40"
      className={
        atRisk
          ? "drop-shadow-[0_0_4px_rgba(255,192,30,0.4)]"
          : "drop-shadow-[0_0_6px_rgba(240,90,40,0.45)]"
      }
    >
      <defs>
        <linearGradient id="bcc-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"  stopColor={atRisk ? "#ffe59c" : "#ffc01e"} />
          <stop offset="55%" stopColor={atRisk ? "#c08020" : "#f05a28"} />
          <stop offset="100%" stopColor="#7a1e08" />
        </linearGradient>
      </defs>
      <path
        d="M20 4 C16 12, 10 14, 12 22 C8 22, 6 28, 8 32 C10 36, 16 38, 20 38 C24 38, 30 36, 32 32 C34 28, 32 22, 28 22 C30 14, 24 12, 20 4 Z"
        fill="url(#bcc-flame)"
        stroke="#0f0d09"
        strokeWidth="1.4"
      />
      <path
        d="M20 18 C18 22, 16 24, 18 28 C20 32, 22 30, 22 26 C22 22, 21 20, 20 18 Z"
        fill="#fff3c4"
        opacity="0.85"
      />
    </svg>
  );
}
