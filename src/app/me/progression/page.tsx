/**
 * /me/progression — §N11 standalone progression page.
 *
 * The LivingHeader strip on /u/[handle] renders ONE threshold (the
 * leading metric) and a single percent bar. This page is the full
 * destination: every metric tracking toward the next rank, plus the
 * trailing reputation-change timeline that the strip omits for space.
 *
 * Server component. Reuses `getUser(ownHandle, token)` — the §3.1
 * contract already ships the own-only `progression` block when the
 * handle matches the session. No new endpoint, no new view-model.
 *
 * Visibility: signed-in only. Anonymous viewers are redirected to
 * `/login?callbackUrl=/me/progression` so they land back here after
 * signing in.
 *
 * Terminus state (top of the ladder): `next_rank` is null on the
 * contract. We render a "TOP OF THE LADDER" stamp instead of the
 * bar/threshold stack so the page never shows an empty progress UI.
 *
 * Stylistically mirrors the `/u/[handle]` page rhythm — FileRail at
 * the top, numbered SectionFrames below — so the destination feels
 * like the same product surface, not a new one.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/api/user-endpoints";
import { RankChip } from "@/components/profile/RankChip";
import type { MemberProgression } from "@/lib/api/types";

export default async function ProgressionPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/me/progression");
  }

  const profile = await getUser(session.user.handle, session.bccToken);

  // Own-only block. The §3.1 contract guarantees this is present when
  // the handle matches the session, but render a soft fallback instead
  // of crashing if the server omits it (caches, partial outages).
  const progression = profile.progression;

  return (
    <main className="pb-24">
      <FileRail handle={profile.handle} />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">YOUR CLIMB</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Progression.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep">
          Every metric the floor measures you on, side-by-side. The
          shorter the bar, the closer you are to your next rank.
        </p>
      </header>

      <SectionFrame fileNumber="01" label="CURRENT GRADE">
        <CurrentGradeBlock
          cardTier={profile.card_tier}
          tierLabel={profile.tier_label}
          rankLabel={profile.rank_label}
          trustScore={profile.trust_score}
        />
      </SectionFrame>

      {progression !== undefined && (
        <>
          <SectionFrame fileNumber="02" label="NEXT RANK">
            <NextRankBlock progression={progression} />
          </SectionFrame>

          <SectionFrame fileNumber="03" label="RECENT REPUTATION CHANGES">
            <RecentChangesBlock changes={progression.trust_score_recent_changes} />
          </SectionFrame>
        </>
      )}

      {progression === undefined && (
        <SectionFrame fileNumber="02" label="UNAVAILABLE">
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
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// FileRail — top status strip, mirrors /u/[handle] and /directory.
// ──────────────────────────────────────────────────────────────────────

function FileRail({ handle }: { handle: string }) {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>OPERATOR &nbsp;//&nbsp; PROGRESSION</span>
          <span className="text-cardstock">@{handle.toUpperCase()}</span>
        </span>
        <span className="bcc-mono text-cardstock/50">
          FILE 0002 &nbsp;//&nbsp; YOUR CLIMB
        </span>
      </div>
    </div>
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
    <section className="mx-auto mt-16 max-w-[1560px] px-7">
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
// NextRankBlock — terminus state OR the full threshold stack.
// Mirrors LivingHeader's percent math (current / required, clamped
// 0-100) but renders ALL thresholds, not just the leading one.
// ──────────────────────────────────────────────────────────────────────

function NextRankBlock({ progression }: { progression: MemberProgression }) {
  if (progression.next_rank === null) {
    return (
      <div className="border border-dashed border-safety/60 bg-cardstock-deep/60 p-6">
        <p className="bcc-mono text-safety">TOP OF THE LADDER</p>
        <p className="mt-3 font-serif text-lg text-cardstock">
          You&rsquo;re a{" "}
          <span className="bcc-stencil">
            {progression.current_rank_label.toUpperCase()}
          </span>
          . The auto-promotion path tops out here — recognition beyond
          this point comes from explicitly-awarded ranks, not metric
          thresholds.
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
                <span className="bcc-mono text-cardstock">
                  {threshold.label.toUpperCase()}
                </span>
                <span className="bcc-mono text-cardstock-deep">
                  <span className="text-cardstock">{threshold.current}</span>
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
                  : `${remaining} ${threshold.label.toLowerCase()} TO GO`}
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
// RecentChangesBlock — the §2.5 ProgressionBlock's last-5 changes
// rendered as a timeline. Each row shows the signed delta + the
// server-rendered reason + the ISO date.
// ──────────────────────────────────────────────────────────────────────

function RecentChangesBlock({
  changes,
}: {
  changes: MemberProgression["trust_score_recent_changes"];
}) {
  if (changes.length === 0) {
    return (
      <p className="font-serif text-base text-cardstock-deep">
        Nothing on the books yet. Reputation changes show up here once
        the floor starts grading your shifts.
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
