/**
 * StandingFileBody — the operator-file body rendered both on
 * `/me/progression` (with hero + FileRail) and inside the Setup tab
 * STANDING sub-tab on `/u/[handle]` (without hero — the parent tab
 * already labels it). Single source of truth so the two surfaces
 * cannot drift.
 *
 * Sections (Rank redesign Phase 5 reshape):
 *   01 // CURRENT GRADE
 *   02 // VERIFIED IDENTITY
 *   03 // ON THE FLOOR
 *   then, branching on the §2.5 progression union:
 *   ranked     → 04 RANK PROGRESS (score/threshold bar + category bars)
 *                05 REQUIREMENTS (diversity · recognizers · outcomes ·
 *                   trust windows)
 *                06 VESTING & STANDING (maturity meter, decay, recovery)
 *                07 FINDINGS (§15 own-view, Phase 8 — only when the
 *                   findings block is present AND non-empty; old
 *                   backends omit it and the section never renders)
 *                07/08 TRUST QUESTS (renumbered when FINDINGS shows)
 *   new_member → 04 GETTING STARTED (§5.1 readiness checklist)
 *   neither    → nothing extra. An old backend's legacy progression
 *                shape (or an absent block) matches neither
 *                discriminant, so the file quietly ends at 03 — C8:
 *                never fabricate a state from missing data.
 *
 * Every number and verdict is server-computed (plan invariant 33); the
 * only client arithmetic is percent widths for bars (presentation).
 * All copy is calibrated per the §2.7 cadence-pressure mitigation —
 * descriptive, not prescriptive. See `scripts/cadence-pressure-guard.sh`.
 */

import type { Route } from "next";
import Link from "next/link";

import { StatusTick } from "@/components/profile/StatusTick";
import { FindingsSection } from "@/components/profile/FindingsSection";
import { NewMemberChip } from "@/components/identity/NewMemberChip";
import { RankChip } from "@/components/profile/RankChip";
import { TrustQuestShareAction } from "@/components/profile/TrustQuestShareAction";
import { TrustQuestsBlock } from "@/components/profile/TrustQuestsBlock";
import type {
  MemberProfile,
  MemberProgressionRanked,
  MemberReadiness,
  MemberState,
  RankCategoryKey,
  ReputationTier,
} from "@/lib/api/types";

export function StandingFileBody({ profile }: { profile: MemberProfile }) {
  const progression = profile.progression;
  // Discriminant narrowing doubles as the old-backend guard: a legacy
  // progression payload carries no member_state, matches neither arm,
  // and the file quietly renders sections 01–03 only.
  const ranked =
    progression !== undefined && progression.member_state === "ranked"
      ? progression
      : null;
  const newMember =
    progression !== undefined && progression.member_state === "new_member"
      ? progression
      : null;

  return (
    <>
      <SectionFrame fileNumber="01" label="CURRENT GRADE">
        <CurrentGradeBlock
          memberState={profile.member_state}
          reputationTier={profile.reputation_tier}
          tierLabel={profile.reputation_tier_label}
          rankLabel={profile.rank_label}
          trustScore={profile.trust_score}
        />
      </SectionFrame>

      <SectionFrame fileNumber="02" label="VERIFIED IDENTITY">
        <VerifiedIdentityBlock profile={profile} />
      </SectionFrame>

      <SectionFrame fileNumber="03" label="ON THE FLOOR">
        <OnTheFloorBlock profile={profile} />
      </SectionFrame>

      {ranked !== null && (
        <>
          <SectionFrame fileNumber="04" label="RANK PROGRESS">
            <RankProgressBlock progression={ranked} />
          </SectionFrame>

          <SectionFrame fileNumber="05" label="REQUIREMENTS">
            <RequirementsBlock progression={ranked} />
          </SectionFrame>

          <SectionFrame fileNumber="06" label="VESTING & STANDING">
            <VestingStandingBlock progression={ranked} />
          </SectionFrame>

          {/*
            §15 findings (Phase 8) — own-view only by construction
            (the findings block ships solely on the self-scoped
            progression). Absent (old backend) or empty (clean file)
            → no section, and TRUST QUESTS keeps its 07 slot.
          */}
          {ranked.findings !== undefined && ranked.findings.length > 0 && (
            <SectionFrame fileNumber="07" label="FINDINGS">
              <FindingsSection findings={ranked.findings} />
            </SectionFrame>
          )}

          <SectionFrame
            fileNumber={
              ranked.findings !== undefined && ranked.findings.length > 0
                ? "08"
                : "07"
            }
            label="TRUST QUESTS"
          >
            <TrustQuestsBlock
              quests={ranked.quests}
              renderAction={(quest) => {
                switch (quest.slug) {
                  case "share_x":
                    return (
                      <TrustQuestShareAction
                        handle={profile.handle}
                        xVerified={profile.verifications.x_verified}
                      />
                    );
                  case "first_vote":
                    return (
                      <QuestNavLink
                        href={"/members" as Route}
                        label="Browse members →"
                      />
                    );
                  case "explore_projects":
                    return (
                      <span className="flex flex-col items-end gap-1">
                        <QuestNavLink
                          href={"/communities" as Route}
                          label="Communities →"
                        />
                        <QuestNavLink
                          href={"/validators" as Route}
                          label="Validators →"
                        />
                      </span>
                    );
                  default:
                    return null;
                }
              }}
            />
          </SectionFrame>
        </>
      )}

      {newMember !== null && (
        <SectionFrame fileNumber="04" label="GETTING STARTED">
          <ReadinessBlock readiness={newMember.readiness} />
        </SectionFrame>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SectionFrame — numbered section wrapper. Matches the /u/[handle]
// rhythm so the destination reads as part of the operator-file vocabulary.
// ──────────────────────────────────────────────────────────────────────

function SectionFrame({
  fileNumber,
  label,
  children,
}: {
  fileNumber: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-12 max-w-[1560px]">
      <div className="mb-6 flex items-baseline justify-between border-b border-dashed border-safety/40 pb-2">
        <span className="bcc-mono text-safety">
          FILE {fileNumber} &nbsp;//&nbsp; {label}
        </span>
      </div>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// QuestNavLink — a quest's "go do it" CTA (e.g. Cast your first vote →
// members, Explore projects → communities/validators). Matches the CTA
// vocabulary used by the VERIFIED IDENTITY rows.
// ──────────────────────────────────────────────────────────────────────

function QuestNavLink({ href, label }: { href: Route; label: string }) {
  return (
    <Link
      href={href}
      className="bcc-mono whitespace-nowrap text-safety hover:underline underline-offset-4"
    >
      {label}
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CurrentGradeBlock — the C8 chip rule + tier flavor + trust score.
// member_state "ranked" → RankChip; "new_member" → NewMemberChip;
// absent (old backend / failure) → no chip at all. Never fabricated.
// ──────────────────────────────────────────────────────────────────────

function CurrentGradeBlock({
  memberState,
  reputationTier,
  tierLabel,
  rankLabel,
  trustScore,
}: {
  memberState: MemberState | undefined;
  reputationTier: ReputationTier;
  tierLabel: string;
  rankLabel: string | null;
  trustScore: number;
}) {
  const showRankChip =
    memberState === "ranked" && typeof rankLabel === "string" && rankLabel !== "";

  return (
    <div className="flex flex-wrap items-center gap-6">
      {showRankChip && (
        <RankChip
          reputationTier={reputationTier}
          tierLabel={tierLabel}
          rankLabel={rankLabel}
        />
      )}
      {memberState === "new_member" && <NewMemberChip />}
      <div className="flex flex-col">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
          TRUST SCORE
        </span>
        <span className="bcc-stencil text-3xl text-bcc-text leading-none">
          {trustScore}
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// VerifiedIdentityBlock — wallet/github/x/profile verification rows.
// See /me/progression/page.tsx PR-11b notes for the §2.7 rationale.
// ──────────────────────────────────────────────────────────────────────

function VerifiedIdentityBlock({ profile }: { profile: MemberProfile }) {
  const walletCount = profile.wallets.length;
  const hallCount = profile.halls.length;
  const verifications = profile.verifications;
  const completeness = verifications.profile_completeness;
  // Server verdict (own-view field). Absent — non-self viewer or old
  // backend — reads as NOT complete: the "Complete →" CTA shows, same
  // as prod today. Never fabricate completeness from missing data.
  const profileComplete = verifications.profile_complete === true;
  const settingsRoute = "/u/me?tab=profile" as Route;
  const profileEditRoute = "/u/me?tab=profile" as Route;
  const hallsRoute = "/halls" as Route;

  const rows: Array<{
    label: string;
    connected: boolean;
    detail: string;
    ctaLabel: string;
    href: Route;
  }> = [
    {
      label: "Wallet",
      connected: walletCount > 0,
      detail:
        walletCount === 0
          ? "Not connected"
          : `${walletCount} verified ${walletCount === 1 ? "link" : "links"}`,
      ctaLabel: walletCount > 0 ? "Manage →" : "Connect →",
      href: settingsRoute,
    },
    {
      label: "GitHub",
      connected: verifications.github_verified,
      detail: verifications.github_verified
        ? `@${verifications.github_username ?? "connected"}`
        : "Not connected",
      ctaLabel: verifications.github_verified ? "Manage →" : "Connect →",
      href: settingsRoute,
    },
    {
      label: "X",
      connected: verifications.x_verified,
      detail: verifications.x_verified
        ? `@${verifications.x_username ?? "connected"}`
        : "Not connected",
      ctaLabel: verifications.x_verified ? "Manage →" : "Connect →",
      href: settingsRoute,
    },
    {
      label: "Profile",
      connected: profileComplete,
      detail: profileComplete
        ? `Complete · ${completeness}%`
        : `${completeness}% complete`,
      ctaLabel: profileComplete ? "Edit →" : "Complete →",
      href: profileEditRoute,
    },
    {
      label: "Hall",
      connected: hallCount > 0,
      detail:
        hallCount === 0
          ? "Not joined"
          : `${hallCount} joined`,
      ctaLabel: hallCount > 0 ? "Manage →" : "Join →",
      href: hallsRoute,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="font-serif text-base leading-relaxed text-bcc-text-secondary max-w-prose">
        These are one-time signals. The floor reads each once — no
        recurring check, no expiry. Adding more strengthens your
        standing, but nothing here is on a schedule.
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-dashed border-bcc-border py-3 last:border-b-0"
          >
            <StatusTick done={row.connected} />
            <span className="flex flex-col">
              <span className="bcc-mono text-bcc-text">
                {row.label.toUpperCase()}
              </span>
              <span className="bcc-mono text-bcc-text-secondary">{row.detail}</span>
            </span>
            <Link
              href={row.href}
              className="bcc-mono text-safety hover:underline underline-offset-4"
            >
              {row.ctaLabel}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// OnTheFloorBlock — content output + engagement received.
// ──────────────────────────────────────────────────────────────────────

function OnTheFloorBlock({ profile }: { profile: MemberProfile }) {
  const counts = profile.counts;
  const floorRoute = "/" as Route;
  const blogRoute = `/u/${profile.handle}?tab=blog` as Route;

  const stats: Array<{
    label: string;
    value: number;
    link?: { href: Route; label: string };
  }> = [
    {
      label: "Blog posts",
      value: counts.blog_posts_written,
      link: { href: blogRoute, label: "Open your blog →" },
    },
    {
      label: "Reviews written",
      value: counts.reviews_written,
    },
    {
      label: "Solids received",
      value: counts.solids_received,
      link: { href: floorRoute, label: "See what's on the floor →" },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="font-serif text-base leading-relaxed text-bcc-text-secondary max-w-prose">
        Posts, reviews, and comments you write surface to other
        operators on the floor. Solids are lightweight community
        acknowledgements — they show where your work is being noticed,
        but they do not directly change your trust score.
      </p>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bcc-panel flex flex-col gap-2 p-4"
          >
            <dt className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
              {stat.label.toUpperCase()}
            </dt>
            <dd className="bcc-stencil text-3xl text-bcc-text leading-none">
              {stat.value}
            </dd>
            {stat.link !== undefined && (
              <Link
                href={stat.link.href}
                className="bcc-mono text-safety hover:underline underline-offset-4 mt-1"
              >
                {stat.link.label}
              </Link>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared bar primitives — phosphor fill + striped remainder, the same
// visual the old threshold stack used. Percent width is the only
// client-side arithmetic (presentation, not business logic).
// ──────────────────────────────────────────────────────────────────────

function clampPct(current: number, target: number): number {
  if (target <= 0) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function ProgressBar({ pct }: { pct: number }) {
  return (
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
  );
}

// Wire keys are plain English words; uppercasing them for the panel
// caption is formatting, not copy derivation.
const CATEGORY_ORDER: RankCategoryKey[] = [
  "contribution",
  "helping",
  "recognition",
  "outcomes",
  "time",
];

// ──────────────────────────────────────────────────────────────────────
// RankProgressBlock — current → next rung, the rank-score/threshold
// bar, and the five category score bars. Terminal rung → quiet panel.
// ──────────────────────────────────────────────────────────────────────

function RankProgressBlock({
  progression,
}: {
  progression: MemberProgressionRanked;
}) {
  const currentLabel = progression.rank_label ?? progression.rank;
  const nextLabel = progression.next_rank_label ?? progression.next_rank;

  return (
    <div className="flex flex-col gap-6">
      {progression.next_rank === null ? (
        <div className="border border-dashed border-safety/60 bg-bcc-surface-hover p-6">
          <p className="bcc-mono text-safety">TERMINAL GRADE</p>
          <p className="mt-3 font-serif text-lg text-bcc-text">
            You&rsquo;re a{" "}
            <span className="bcc-stencil">{currentLabel.toUpperCase()}</span>.
            That&rsquo;s the top of the earned ladder. Your trust tier is
            the axis that keeps moving.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="bcc-mono inline-flex items-baseline gap-3 text-bcc-text-secondary">
            <span className="text-bcc-text">{currentLabel.toUpperCase()}</span>
            {/* The arrow carries "next"; the colour does not need to. */}
            <span className="text-bcc-text-secondary">→</span>
            <span className="text-bcc-text-secondary">
              {(nextLabel ?? "").toUpperCase()}
            </span>
          </p>
          {progression.next_threshold !== null && (
            <div className="bcc-panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="bcc-mono text-bcc-text">RANK SCORE</span>
                <span className="bcc-mono text-bcc-text-secondary">
                  <span className="text-bcc-text">{progression.rank_score}</span>
                  <span className="mx-1 text-bcc-text-secondary">/</span>
                  {progression.next_threshold}
                </span>
              </div>
              <ProgressBar
                pct={clampPct(progression.rank_score, progression.next_threshold)}
              />
            </div>
          )}
        </div>
      )}

      {/* Five category bars — server-scored, rendered verbatim. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {CATEGORY_ORDER.map((key) => {
          const cat = progression.categories[key];
          if (cat === undefined) {
            // Wire tolerance: a category the client knows but the server
            // didn't send (or vice versa via the Record type) — skip.
            return null;
          }
          return (
            <li key={key} className="bcc-panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
                  {key.toUpperCase()}
                </span>
                <span className="bcc-mono text-bcc-text-secondary">
                  <span className="text-bcc-text">{cat.score}</span>
                  <span className="mx-1 text-bcc-text-secondary">/</span>
                  {cat.max}
                </span>
              </div>
              <ProgressBar pct={clampPct(cat.score, cat.max)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// RequirementsBlock — diversity, recognizers, outcomes, and the
// tier-day trust windows, each shown as "where you are vs what each
// rung asks for". Counts and requirements are all server-supplied.
// ──────────────────────────────────────────────────────────────────────

function RequirementsBlock({
  progression,
}: {
  progression: MemberProgressionRanked;
}) {
  const { diversity, recognizers, outcomes, trust_windows } = progression;

  const countRows: Array<{ label: string; value: string; requirement: string }> = [
    {
      label: "Contribution mix",
      value: `${diversity.contribution_types} ${
        diversity.contribution_types === 1 ? "type" : "types"
      } on the books`,
      requirement: `Journeyman asks for ${diversity.journeyman_required} · Veteran ${diversity.veteran_required}`,
    },
    {
      label: "Independent recognizers",
      value: `${recognizers.independent} ${
        recognizers.independent === 1 ? "member" : "members"
      }`,
      requirement: `Journeyman asks for ${recognizers.journeyman_required} · Veteran ${recognizers.veteran_required}`,
    },
    {
      label: "Confirmed outcomes",
      value: `${outcomes.count} across ${outcomes.types} ${
        outcomes.types === 1 ? "type" : "types"
      }`,
      requirement: `Veteran asks for ${outcomes.veteran_required} across ${outcomes.veteran_types_required} types`,
    },
  ];

  const windowEntries = (
    Object.entries(trust_windows) as Array<
      [string, MemberProgressionRanked["trust_windows"]["journeyman"]]
    >
  );

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col">
        {countRows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-1 gap-1 border-b border-dashed border-bcc-border py-3 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-4"
          >
            <span className="flex flex-col">
              <span className="bcc-mono text-bcc-text">
                {row.label.toUpperCase()}
              </span>
              <span className="bcc-mono text-bcc-text-secondary">{row.value}</span>
            </span>
            <span className="bcc-mono text-bcc-text-secondary">{row.requirement}</span>
          </li>
        ))}
      </ul>

      {windowEntries.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {windowEntries.map(([rung, w]) => (
            <li key={rung} className="bcc-panel flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
                  {rung.toUpperCase()} WINDOW
                </span>
                <span className="bcc-mono text-bcc-text-secondary">
                  <span className="text-bcc-text">{w.qualifying}</span>
                  <span className="mx-1 text-bcc-text-secondary">/</span>
                  {w.required} days
                </span>
              </div>
              <ProgressBar pct={clampPct(w.qualifying, w.required)} />
              <p className="bcc-mono text-bcc-text-secondary">
                Days at {w.min_tier.toUpperCase()}+ within the last {w.window}{" "}
                days
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// VestingStandingBlock — §16.3 vote-weight maturity meter plus the
// decay / recovery states. Negative states render quietly (no alarm
// UI; §E2 — negative events never celebrate OR shame).
// ──────────────────────────────────────────────────────────────────────

function VestingStandingBlock({
  progression,
}: {
  progression: MemberProgressionRanked;
}) {
  const { vesting, decay, recovery } = progression;
  const maturityPct = Math.max(0, Math.min(100, Math.round(vesting.maturity * 100)));

  return (
    <div className="flex flex-col gap-4">
      <div className="bcc-panel flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="bcc-mono text-bcc-text">VOTE-WEIGHT MATURITY</span>
          <span className="bcc-mono text-bcc-text-secondary">
            <span className="text-bcc-text">{maturityPct}%</span>
            <span aria-hidden className="mx-2 text-bcc-text-muted">·</span>
            {vesting.days_elapsed}/{vesting.span_days} days vested
          </span>
        </div>
        <ProgressBar pct={maturityPct} />
        <p className="bcc-mono text-bcc-text-secondary">
          Vesting runs on its own clock from the day Apprentice was earned
          — nothing to do here.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {decay.active ? (
          <p className="bcc-mono text-[var(--bcc-warning)]">
            DECAY ACTIVE — {decay.points}{" "}
            {decay.points === 1 ? "point" : "points"} currently resting off
            your rank score.
          </p>
        ) : (
          <p className="bcc-mono text-bcc-text-secondary">
            No decay on the books.
          </p>
        )}
        {recovery !== null && (
          <div className="border border-dashed border-safety/60 bg-bcc-surface-hover flex flex-col gap-2 p-4">
            <p className="bcc-mono text-bcc-text-secondary">
              RECOVERY WINDOW OPEN — grace period runs until{" "}
              <span className="text-bcc-text">{recovery.deadline}</span> (UTC).
            </p>
            {/*
              §14.2 Phase 8 detail — both fields optional so the old
              prod backend's {deadline}-only shape renders exactly the
              line above and nothing else.
            */}
            {recovery.paused_privileges !== undefined &&
              recovery.paused_privileges.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary">
                    PAUSED WHILE THE WINDOW IS OPEN
                  </span>
                  <ul className="flex flex-col">
                    {recovery.paused_privileges.map((slug) => (
                      <li
                        key={slug}
                        className="bcc-mono text-bcc-text-secondary"
                      >
                        <span aria-hidden className="text-bcc-text-muted">
                          ○{" "}
                        </span>
                        {pausedPrivilegeLabel(slug)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            {recovery.instructions !== undefined &&
              recovery.instructions !== "" && (
                <p className="font-serif text-base text-bcc-text">
                  {recovery.instructions}
                </p>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

// §14.2 wire slugs → human labels. Presentation mapping only — WHICH
// privileges pause is server-decided; unknown future slugs fall back
// to a de-snake-cased rendering rather than disappearing.
const PAUSED_PRIVILEGE_LABELS: Record<string, string> = {
  vote_multiplier: "Vote weight boost",
  ranked_hall_posting: "Ranked Hall posting",
  community_custody: "Community ownership changes",
  mentor_listing: "Mentor listing",
};

function pausedPrivilegeLabel(slug: string): string {
  const mapped = PAUSED_PRIVILEGE_LABELS[slug];
  if (mapped !== undefined) return mapped;
  const words = slug.replace(/_/g, " ").trim();
  if (words === "") return slug;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ──────────────────────────────────────────────────────────────────────
// ReadinessBlock — the §5.1 New Member checklist. Copy is
// neutral-imperative and descriptive (§2.7 cadence-pressure policy):
// it names what unlocks Apprentice, never how long it's been.
// ──────────────────────────────────────────────────────────────────────

function ReadinessBlock({ readiness }: { readiness: MemberReadiness }) {
  const settingsRoute = "/u/me?tab=profile" as Route;
  const floorRoute = "/" as Route;

  const rows: Array<{
    label: string;
    done: boolean;
    detail: string;
    cta: { href: Route; label: string } | null;
  }> = [
    {
      label: "Profile",
      done: readiness.profile_setup,
      detail: readiness.profile_setup
        ? "Set up"
        : "Add a photo and a few details",
      cta: readiness.profile_setup
        ? null
        : { href: settingsRoute, label: "Complete →" },
    },
    {
      label: "Identity",
      done: readiness.verified_identity,
      detail: readiness.verified_identity
        ? "Verified"
        : "Verify your email or connect a wallet",
      cta: readiness.verified_identity
        ? null
        : { href: settingsRoute, label: "Verify →" },
    },
    {
      label: "First contribution",
      done: readiness.qualifying_contribution,
      detail: readiness.qualifying_contribution
        ? "On the books"
        : "Post or comment to get started",
      cta: readiness.qualifying_contribution
        ? null
        : { href: floorRoute, label: "Go to the Floor →" },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="font-serif text-base leading-relaxed text-bcc-text-secondary max-w-prose">
        Apprentice is the first earned rank. These three signals are what
        the floor reads before it&rsquo;s awarded — each is a one-time
        step, in any order.
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-dashed border-bcc-border py-3 last:border-b-0"
          >
            <StatusTick done={row.done} />
            <span className="flex flex-col">
              <span className="bcc-mono text-bcc-text">
                {row.label.toUpperCase()}
              </span>
              <span className="bcc-mono text-bcc-text-secondary">{row.detail}</span>
            </span>
            {row.cta !== null && (
              <Link
                href={row.cta.href}
                className="bcc-mono text-safety hover:underline underline-offset-4"
              >
                {row.cta.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {readiness.confirmation_due_at !== null && (
        <div className="border border-dashed border-safety/60 bg-bcc-surface-hover p-5">
          <p className="bcc-mono text-safety">APPRENTICE CONFIRMATION UNDERWAY</p>
          <p className="mt-2 font-serif text-base text-bcc-text">
            Your qualifying contribution is in its 24-hour confirmation
            window. It completes at{" "}
            <span className="bcc-mono">{readiness.confirmation_due_at}</span>{" "}
            (UTC) — nothing else to do.
          </p>
        </div>
      )}
    </div>
  );
}
