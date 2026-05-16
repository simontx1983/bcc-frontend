/**
 * StandingFileBody — the operator-file body rendered both on
 * `/me/progression` (with hero + FileRail) and inside the Setup tab
 * STANDING sub-tab on `/u/[handle]` (without hero — the parent tab
 * already labels it). Single source of truth so the two surfaces
 * cannot drift.
 *
 * Sections (PR-11b reshape):
 *   01 // CURRENT GRADE
 *   02 // VERIFIED IDENTITY
 *   03 // ON THE FLOOR
 *   04 // NEXT RANK (when progression block present)
 *   05 // REPUTATION RECORD (when progression block present)
 *
 * All copy is calibrated per the §2.7 cadence-pressure mitigation —
 * descriptive, not prescriptive. See `scripts/cadence-pressure-guard.sh`.
 */

import type { Route } from "next";
import Link from "next/link";

import { RankChip } from "@/components/profile/RankChip";
import type { MemberProfile, MemberProgression } from "@/lib/api/types";

// Threshold mirrors QuestValidator::COMPLETE_PROFILE_THRESHOLD (PHP).
// Same number both sides — if you tune one, tune both.
const PROFILE_COMPLETE_THRESHOLD = 80;

export function StandingFileBody({ profile }: { profile: MemberProfile }) {
  const progression = profile.progression;

  return (
    <>
      <SectionFrame fileNumber="01" label="CURRENT GRADE">
        <CurrentGradeBlock
          cardTier={profile.card_tier}
          tierLabel={profile.tier_label}
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

      {progression !== undefined && (
        <>
          <SectionFrame fileNumber="04" label="NEXT RANK">
            <NextRankBlock progression={progression} />
          </SectionFrame>

          <SectionFrame fileNumber="05" label="REPUTATION RECORD">
            <RecentChangesBlock changes={progression.trust_score_recent_changes} />
          </SectionFrame>
        </>
      )}

      {progression === undefined && (
        <SectionFrame fileNumber="04" label="UNAVAILABLE">
          <p className="font-serif text-base text-cardstock-deep">
            We couldn&rsquo;t load your progression details. Try again
            in a moment, or check your{" "}
            <Link
              href={`/u/${profile.handle}` as Route}
              className="text-safety underline-offset-2 hover:underline"
            >
              profile page
            </Link>{" "}
            for the live-shift strip.
          </p>
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
// CurrentGradeBlock — current rank chip + tier flavor + trust score.
// All values are server-rendered per §A2; this component never derives.
// ──────────────────────────────────────────────────────────────────────

function CurrentGradeBlock({
  cardTier,
  tierLabel,
  rankLabel,
  trustScore,
}: {
  cardTier: import("@/lib/api/types").CardTier;
  tierLabel: string | null;
  rankLabel: string;
  trustScore: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      <RankChip cardTier={cardTier} tierLabel={tierLabel} rankLabel={rankLabel} />
      <div className="flex flex-col">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          TRUST SCORE
        </span>
        <span className="bcc-stencil text-3xl text-cardstock leading-none">
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
  const localCount = profile.locals.length;
  const verifications = profile.verifications;
  const completeness = verifications.profile_completeness;
  const profileComplete = completeness >= PROFILE_COMPLETE_THRESHOLD;
  const settingsRoute = "/settings/identity" as Route;
  const profileEditRoute = "/settings/profile" as Route;
  const localsRoute = "/locals" as Route;

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
      label: "Local",
      connected: localCount > 0,
      detail:
        localCount === 0
          ? "Not joined"
          : `${localCount} joined`,
      ctaLabel: localCount > 0 ? "Manage →" : "Join →",
      href: localsRoute,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="font-serif text-base leading-relaxed text-cardstock-deep max-w-prose">
        These are one-time signals. The floor reads each once — no
        recurring check, no expiry. Adding more strengthens your
        standing, but nothing here is on a schedule.
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-dashed border-cardstock/15 py-3 last:border-b-0"
          >
            <span
              aria-hidden
              className={
                "bcc-mono text-lg leading-none " +
                (row.connected ? "text-phosphor" : "text-ink-ghost")
              }
            >
              {row.connected ? "✓" : "○"}
            </span>
            <span className="flex flex-col">
              <span className="bcc-mono text-cardstock">
                {row.label.toUpperCase()}
              </span>
              <span className="bcc-mono text-cardstock-deep">{row.detail}</span>
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
      <p className="font-serif text-base leading-relaxed text-cardstock-deep max-w-prose">
        Posts, reviews, and comments you write surface to other
        operators on the floor. When they react or endorse your work,
        those signals roll into your standing.
      </p>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bcc-panel flex flex-col gap-2 p-4"
          >
            <dt className="bcc-mono text-[10px] tracking-[0.2em] text-ink-soft">
              {stat.label.toUpperCase()}
            </dt>
            <dd className="bcc-stencil text-3xl text-ink leading-none">
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
// NextRankBlock — terminus state OR the threshold stack.
// ──────────────────────────────────────────────────────────────────────

function NextRankBlock({ progression }: { progression: MemberProgression }) {
  if (progression.next_rank === null) {
    return (
      <div className="border border-dashed border-safety/60 bg-cardstock-deep/60 p-6">
        <p className="bcc-mono text-safety">TERMINAL GRADE</p>
        <p className="mt-3 font-serif text-lg text-cardstock">
          You&rsquo;re a{" "}
          <span className="bcc-stencil">
            {progression.current_rank_label.toUpperCase()}
          </span>
          . The auto-graded ladder tops out here — ranks beyond this
          come from explicit recognition, not metric thresholds.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="bcc-mono inline-flex items-baseline gap-3 text-cardstock-deep">
        <span className="text-cardstock">
          {progression.current_rank_label.toUpperCase()}
        </span>
        <span className="text-ink-ghost">→</span>
        <span className="bcc-phosphor-text">
          {(progression.next_rank_label ?? progression.next_rank).toUpperCase()}
        </span>
      </p>

      {progression.next_rank_thresholds.length === 0 && (
        <p className="font-serif text-base text-cardstock-deep">
          Threshold details unavailable right now.
        </p>
      )}

      <ul className="flex flex-col gap-5">
        {progression.next_rank_thresholds.map((threshold) => {
          const pct = thresholdPercent(threshold.current, threshold.required);
          const remaining = Math.max(0, threshold.required - threshold.current);
          return (
            <li
              key={threshold.metric}
              className="bcc-panel flex flex-col gap-2 p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="bcc-mono text-ink">
                  {threshold.label.toUpperCase()}
                </span>
                <span className="bcc-mono text-ink-soft">
                  <span className="text-ink">{threshold.current}</span>
                  <span className="mx-1 text-ink-ghost">/</span>
                  {threshold.required}
                </span>
              </div>
              <div className="relative h-3 border border-cardstock/25 bg-concrete-hi">
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${pct}%`,
                    background:
                      "linear-gradient(90deg, var(--verified), var(--phosphor))",
                    boxShadow: "0 0 8px rgba(125, 255, 154, 0.6)",
                  }}
                />
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
              <p className="bcc-mono text-ink-ghost">
                {remaining === 0
                  ? "THRESHOLD REACHED"
                  : `${remaining} ${threshold.label.toLowerCase()} remaining`}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function thresholdPercent(current: number, required: number): number {
  if (required <= 0) {
    return 100;
  }
  const raw = (current / required) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ──────────────────────────────────────────────────────────────────────
// RecentChangesBlock — the §2.5 ProgressionBlock's last-5 changes as a
// timeline.
// ──────────────────────────────────────────────────────────────────────

function RecentChangesBlock({
  changes,
}: {
  changes: MemberProgression["trust_score_recent_changes"];
}) {
  if (changes.length === 0) {
    return (
      <p className="font-serif text-base text-cardstock-deep">
        No reputation moves on the books yet. Changes appear here when
        the floor adjusts your standing.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {changes.map((change, idx) => {
        const positive = change.delta > 0;
        const sign = positive ? "+" : change.delta < 0 ? "−" : "±";
        const magnitude = Math.abs(change.delta);
        const toneClass = positive
          ? "text-phosphor"
          : change.delta < 0
            ? "text-weld"
            : "text-cardstock-deep";
        return (
          <li
            key={`${change.at}-${idx}`}
            className="grid grid-cols-[auto_1fr_auto] items-baseline gap-4 border-b border-dashed border-cardstock/15 pb-3 last:border-b-0 last:pb-0"
          >
            <span className={`bcc-stencil text-2xl leading-none ${toneClass}`}>
              {sign}
              {magnitude}
            </span>
            <span className="font-serif text-cardstock">{change.reason}</span>
            <span className="bcc-mono text-cardstock-deep">{change.at}</span>
          </li>
        );
      })}
    </ol>
  );
}
