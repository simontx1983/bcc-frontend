/**
 * FloorIntro — the guest landing page, Direction A "LEDGER" (locked with
 * Tia; Direction B "Forge Floor" is a deferred trading-card-redesign
 * track, see HANDOVER-ux-batch-landing-mobile-comments.md's appendix).
 * Mounted at `(marketing)/welcome`; anon `/` middleware-rewrites here.
 *
 * Full-bleed marketing surface on the page-chrome token system — replaces
 * the old workshop-palette (cardstock/safety/weld) FloorIntro entirely.
 * Server component shell; small "use client" islands carry the animated
 * pieces (embers canvas, scroll-reveal, count-up, magnetic CTAs) so the
 * RSC surface stays large. The live ledger and marquee are pure CSS
 * (`@keyframes` loops over server-rendered doubled lists) — no client JS
 * needed for either.
 *
 * The demo trading-card section is deliberately NOT here — deferred until
 * the card redesign lands (see the handover appendix for the reference
 * CSS/JS to build it from then).
 */

import { X } from "lucide-react";
import Link from "next/link";

import { LandingCountUp } from "@/components/landing/LandingCountUp";
import { LandingEmbers } from "@/components/landing/LandingEmbers";
import { LandingFloorPeek } from "@/components/landing/LandingFloorPeek";
import { LandingLedger } from "@/components/landing/LandingLedger";
import { LandingMagneticLink } from "@/components/landing/LandingMagneticLink";
import { LandingReveal } from "@/components/landing/LandingReveal";

export function FloorIntro() {
  return (
    <div className="bcc-ldg-root">
      <div className="bcc-ldg-field" aria-hidden>
        <div className="bcc-ldg-field-grid" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g1" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g2" />
      </div>

      <div className="bcc-ldg-wrap">
        <Marquee />
        <Hero />

        <section className="bcc-ldg-section">
          <LandingReveal as="p" className="bcc-ldg-eyebrow">
            What the floor stands for
          </LandingReveal>
          <Pillars />
        </section>

        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <Loop />
        </section>

        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <FloorNow />
        </section>

        <section className="bcc-ldg-section bcc-ldg-closing">
          <ClosingCta />
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Marquee — the "not for sale" wedge, edge-to-edge above the hero.
// Anti-pay message targets reputation, not ad inventory (BCC will run
// external ads) — reworded copy per Tia. Pure CSS scroll, doubled list.
// ─────────────────────────────────────────────────────────────────────

interface MarqueeItem {
  mark: "x" | "em";
  body: string;
}

const MARQUEE_ITEMS: readonly MarqueeItem[] = [
  { mark: "x", body: "Bought rank — not available" },
  { mark: "em", body: "Reputation you can't buy" },
  { mark: "x", body: "Sponsored grades — not available" },
  { mark: "em", body: "Built in public" },
  { mark: "x", body: "Boosted accounts — not available" },
  { mark: "x", body: "Bot reviews — not available" },
  { mark: "em", body: "The chain remembers" },
  { mark: "x", body: "Paid checkmarks — not available" },
] as const;

function Marquee() {
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div className="bcc-ldg-marquee" aria-hidden>
      <div className="bcc-ldg-marquee-track">
        {doubled.map((item, idx) => (
          <span key={idx}>
            <span className={item.mark === "x" ? "bcc-ldg-marquee-x" : "bcc-ldg-marquee-em"}>
              {item.mark === "x" ? <X size={12} strokeWidth={2.4} aria-hidden /> : "—"}
            </span>
            {item.body}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Hero — the thesis. Left: stencil wedge + lede + CTAs + stat tiles.
// Right: the live Reputation Ledger. Ambient embers drift behind both.
// ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="bcc-ldg-hero" style={{ position: "relative" }}>
      <LandingEmbers />
      <div>
        <span className="bcc-ldg-status">
          <span className="bcc-ldg-pulse" aria-hidden />
          Floor // Open
        </span>
        <h1 className="bcc-ldg-disp">
          Reputation
          <br />
          you can&rsquo;t <span className="bcc-ldg-strike">buy.</span>
        </h1>
        <p className="bcc-ldg-lede">
          You can&rsquo;t buy a checkmark. You can&rsquo;t pay for a tier. You can&rsquo;t sponsor a grade.{" "}
          <b>The only currency on the floor is the work you actually did.</b>
        </p>
        <div className="bcc-ldg-cta">
          <LandingMagneticLink href="/signup" className="bcc-ldg-btn bcc-ldg-btn-primary">
            Join the Floor →
          </LandingMagneticLink>
          <Link href="/login" className="bcc-ldg-btn bcc-ldg-btn-ghost">
            Sign In
          </Link>
        </div>
        <div className="bcc-ldg-stats">
          <div>
            <div className="n">0</div>
            <div className="k">Boosted accounts</div>
          </div>
          <div>
            <div className="n">0</div>
            <div className="k">Sponsored grades</div>
          </div>
          <div>
            <div className="n">
              <LandingCountUp target={100} suffix="%" />
            </div>
            <div className="k">Earned on-chain</div>
          </div>
        </div>
      </div>

      <LandingLedger />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pillars — three claims, what BCC stands for (and against).
// ─────────────────────────────────────────────────────────────────────

interface Pillar {
  no: string;
  title: string;
  copy: string;
}

const PILLARS: readonly Pillar[] = [
  {
    no: "01",
    title: "Earned, not bought",
    copy: "No paid placement. No sponsored grades. No buying your way to legendary. Every mark came from a real person who worked with you.",
  },
  {
    no: "02",
    title: "Verified human",
    copy: "Wallet on-chain. History on file. Community vouching baked in. Bot farms can't fake their way into a real reputation here.",
  },
  {
    no: "03",
    title: "Built in public",
    copy: "Every review, every dispute, every attestation — on the record. No back-room moderation. No silent shadowbans.",
  },
] as const;

function Pillars() {
  return (
    <div className="bcc-ldg-pillars">
      {PILLARS.map((pillar, i) => (
        <LandingReveal key={pillar.no} delayMs={i * 80} className="bcc-ldg-pillar">
          <div className="no">{pillar.no}</div>
          <h3>{pillar.title}</h3>
          <p>{pillar.copy}</p>
        </LandingReveal>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Loop — the 5-move trust engine. A real ordered process, numbered
// markers are earned here (unlike a generic feature list).
// ─────────────────────────────────────────────────────────────────────

interface LoopStep {
  n: string;
  verb: string;
  line: React.ReactNode;
}

const LOOP: readonly LoopStep[] = [
  { n: "Step 01", verb: "Discover", line: "Find real operators doing real work." },
  { n: "Step 02", verb: "Signal", line: "Vote, attest, or dispute." },
  { n: "Step 03", verb: "Record", line: "Everything is tracked. Nothing disappears." },
  { n: "Step 04", verb: "Compound", line: "Your accuracy builds your weight." },
  {
    n: "Step 05",
    verb: "Access →",
    line: "Higher trust unlocks reviews, disputes & attestations.",
  },
] as const;

function Loop() {
  return (
    <>
      <div className="bcc-ldg-looptop">
        <div>
          <LandingReveal as="p" className="bcc-ldg-eyebrow" style={{ marginBottom: 0 }}>
            The trust engine
          </LandingReveal>
          <LandingReveal as="h2">Five moves. The chain remembers everything.</LandingReveal>
        </div>
        <LandingReveal as="p">
          Your signal earns its weight. Discover real operators, act on what you see, and compound the record over time.
        </LandingReveal>
      </div>
      <div className="bcc-ldg-loop">
        {LOOP.map((step, i) => (
          <LandingReveal key={step.n} delayMs={i * 60} className="bcc-ldg-step" as="div">
            <div className="s">{step.n}</div>
            <h4>{step.verb}</h4>
            <p>{step.line}</p>
          </LandingReveal>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// On the floor now — bounded proof-of-life peek (NOT the infinite feed).
// ─────────────────────────────────────────────────────────────────────

function FloorNow() {
  return (
    <div className="bcc-ldg-floornow">
      <LandingReveal as="div" className="bcc-ldg-fh">
        <span className="bcc-ldg-fh-live">
          <i aria-hidden />
          On the floor right now
        </span>
        <span className="bcc-ldg-fh-rule" aria-hidden />
        <Link href="/directory">See the whole floor →</Link>
      </LandingReveal>
      <LandingFloorPeek />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Closing — last CTA before conversion, handwritten sign-off.
// ─────────────────────────────────────────────────────────────────────

function ClosingCta() {
  return (
    <>
      <LandingReveal as="p" className="bcc-ldg-eyebrow" style={{ justifyContent: "center" }}>
        Shift start
      </LandingReveal>
      <LandingReveal as="h2">
        Step onto
        <br />
        the floor.
      </LandingReveal>
      <LandingReveal as="p">
        Free to join. Free to read. Sign your first review and start building a record nobody can buy.
      </LandingReveal>
      <LandingReveal as="div" className="bcc-ldg-cta" style={{ justifyContent: "center" }}>
        <LandingMagneticLink href="/signup" className="bcc-ldg-btn bcc-ldg-btn-primary">
          Join the Floor →
        </LandingMagneticLink>
        <Link href="/login" className="bcc-ldg-btn bcc-ldg-btn-ghost">
          Sign In
        </Link>
      </LandingReveal>
      <span aria-hidden className="bcc-ldg-signed">
        — signed, the floor
      </span>
    </>
  );
}
