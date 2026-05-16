/**
 * ReliabilityMirrorBody — the §J.5 self-mirror body rendered both on
 * `/me/reliability` (with hero + FileRail) and inside the Setup tab
 * RELIABILITY sub-tab on `/u/[handle]` (without hero — the parent tab
 * already labels it). Single source of truth so the two surfaces
 * cannot drift.
 *
 * Sections:
 *   01 // STANDING
 *   02 // YOUR STATE (only when divergence_state ≠ untested)
 *   03 // WHERE YOU'VE SHOWN UP
 *   04 // HOW THIS WORKS
 *
 * All copy is calibrated per the §2.7 cadence-pressure mitigation —
 * descriptive, not prescriptive. The HOW THIS WORKS block imports
 * its load-bearing strings from `lib/copy/trust-layer.ts` so they
 * cannot drift from the onboarding Card 3 framing.
 */

import { ReliabilityStandingBadge } from "@/components/reliability/ReliabilityStandingBadge";
import type {
  MeReliabilityResponse,
  ReliabilityTrendDirection,
} from "@/lib/api/types";
import {
  ABSENCE_NOT_NEGATIVE,
  REPUTATION_VS_RELIABILITY,
} from "@/lib/copy/trust-layer";

export function ReliabilityMirrorBody({
  reliability,
}: {
  reliability: MeReliabilityResponse;
}) {
  return (
    <>
      <SectionFrame fileNumber="01" label="STANDING">
        <StandingBlock reliability={reliability} />
      </SectionFrame>

      {reliability.divergence_state !== "untested" && (
        <SectionFrame fileNumber="02" label="YOUR STATE">
          <ExplainerBlock explainer={reliability.explainer} />
        </SectionFrame>
      )}

      <SectionFrame fileNumber="03" label="WHERE YOU'VE SHOWN UP">
        <ShowUpBlock reliability={reliability} />
      </SectionFrame>

      <SectionFrame fileNumber="04" label="HOW THIS WORKS">
        <TeachingBlock />
      </SectionFrame>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SectionFrame — matches /me/progression's StandingFileBody so both
// surfaces share the same numbered-file rhythm.
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
// StandingBlock — Standing badge + trend direction + lifetime cast count.
// No numeric reliability score per Phase 1 cuttable split (§11).
// ──────────────────────────────────────────────────────────────────────

function StandingBlock({ reliability }: { reliability: MeReliabilityResponse }) {
  return (
    <div className="flex flex-wrap items-start gap-x-12 gap-y-6">
      <div className="flex flex-col gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          STANDING
        </span>
        <ReliabilityStandingBadge standing={reliability.reliability_standing} />
      </div>

      <div className="flex flex-col gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          TREND
        </span>
        <TrendIndicator direction={reliability.trends.direction} />
      </div>

      <div className="flex flex-col gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          ATTESTATIONS CAST
        </span>
        <span className="bcc-stencil text-3xl text-cardstock leading-none">
          {reliability.since_attestation_count}
        </span>
      </div>
    </div>
  );
}

function TrendIndicator({ direction }: { direction: ReliabilityTrendDirection }) {
  const TREND: Record<
    ReliabilityTrendDirection,
    { glyph: string; label: string; toneClass: string }
  > = {
    improving: {
      glyph: "↑",
      label: "Improving",
      toneClass: "text-phosphor",
    },
    steady: {
      glyph: "→",
      label: "Steady",
      toneClass: "text-cardstock-deep",
    },
    softening: {
      glyph: "↓",
      label: "Softening",
      toneClass: "text-safety/70",
    },
  };
  const t = TREND[direction];
  return (
    <span className={`bcc-mono inline-flex items-baseline gap-2 ${t.toneClass}`}>
      <span aria-hidden style={{ fontSize: "1.5em", lineHeight: 1 }}>
        {t.glyph}
      </span>
      <span>{t.label.toUpperCase()}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ExplainerBlock — server-pinned headline + body. §A2: render verbatim.
// ──────────────────────────────────────────────────────────────────────

function ExplainerBlock({
  explainer,
}: {
  explainer: MeReliabilityResponse["explainer"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="bcc-stencil text-3xl text-cardstock leading-tight">
        {explainer.headline}
      </p>
      <p className="font-serif text-lg leading-relaxed text-cardstock-deep max-w-prose">
        {explainer.body}
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ShowUpBlock — Stand Behind allocation as quiet context.
// ──────────────────────────────────────────────────────────────────────

function ShowUpBlock({ reliability }: { reliability: MeReliabilityResponse }) {
  const { slots_total, slots_used } = reliability.stand_behind_allocation;
  return (
    <div className="flex flex-col gap-4">
      <p className="font-serif text-lg leading-relaxed text-cardstock">
        You&rsquo;re standing behind{" "}
        <span className="bcc-stencil text-cardstock">{slots_used}</span>
        {slots_total > 0 && (
          <>
            {" "}of{" "}
            <span className="bcc-stencil text-cardstock">{slots_total}</span>
          </>
        )}{" "}
        operators at your current tier.
      </p>
      <p className="font-serif text-cardstock-deep">
        Vouches are easy to give. Stand Behind is reserved for higher
        conviction — each one represents your reputation attached to
        someone else&rsquo;s work.
      </p>
      <p className="font-serif text-cardstock-deep">
        This isn&rsquo;t about liking someone, following the crowd, or
        rewarding popularity. It&rsquo;s about trust. Do they do what they
        say they&rsquo;ll do? Do they consistently show up? Are they who
        they claim to be? Stand Behind is meant for people whose actions
        repeatedly match their words.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TeachingBlock — §2.9 + reputation/reliability framing. Constants
// imported from lib/copy/trust-layer.ts so this surface and onboarding
// Card 3 cannot drift.
// ──────────────────────────────────────────────────────────────────────

function TeachingBlock() {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-serif text-lg leading-relaxed text-cardstock">
        {REPUTATION_VS_RELIABILITY.reputation_grows}
      </p>
      <p className="font-serif text-lg leading-relaxed text-cardstock">
        {REPUTATION_VS_RELIABILITY.reliability_definition}
      </p>
      <p className="font-serif text-cardstock-deep">
        {REPUTATION_VS_RELIABILITY.both_grow_slowly}
      </p>
      <p className="font-serif text-cardstock-deep">
        <strong className="text-cardstock">
          {ABSENCE_NOT_NEGATIVE.headline}
        </strong>{" "}
        {ABSENCE_NOT_NEGATIVE.body}
      </p>
      <p className="font-serif text-cardstock-deep">
        This page updates weekly. There is no real-time ticker because
        trust isn&rsquo;t useful at minute-by-minute resolution.
        Reputation can change quickly; reliability should not.
        Reliability is earned over months of observed behavior, not
        keystrokes.
      </p>
    </div>
  );
}
