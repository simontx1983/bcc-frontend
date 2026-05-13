/**
 * FloorIntro — anon-only context block for the home page.
 *
 * Mounts above <FeedView /> on `/` only when the viewer is logged out.
 * The Floor feed is shown to anon users immediately (per §F2 Hot
 * fallback), but a fresh visitor lands on a stream of posts about
 * validators, creators, and projects they have no context for. They
 * bounce. This block answers — in order — five questions a visitor
 * needs answered before the feed below makes any sense:
 *
 *   1. Hero        → "What is this?"            (3 seconds)
 *   2. Pillars     → "What do you stand for?"   (10 seconds)
 *   3. Loop        → "How does it work?"        (15 seconds)
 *   4. Demo card   → "What does it feel like?"  (interactive)
 *   5. Closing CTA → "What do I do now?"
 *
 * A slow horizontal marquee runs along the very top of the section
 * (edge-to-edge, above the hero) cycling the wedge in motion —
 * "✕ PAID PLACEMENT — NOT AVAILABLE / — REPUTATION YOU CAN'T BUY —"
 * etc. It establishes the positioning before the H1 lands and keeps
 * the anti-paid-trust message live as the visitor scrolls.
 *
 * Server component. The only interactive island is <CardFactory />,
 * which already manages its own state. Anon viewers see the card's
 * Pull / Review buttons disabled (server returns can_pull: false /
 * can_review: false in anon contexts per §N7) — correct UX, since
 * actually pulling requires sign-in.
 *
 * Voice: one wedge, repeated. Verification you earn, not buy. No paid
 * checkmarks. No bought grades. No bot reviews. No sponsored tier.
 * The only currency on the floor is the work you actually did.
 */

import Link from "next/link";

import { CardFactory } from "@/components/cards/CardFactory";
import type { Card } from "@/lib/api/types";

export interface FloorIntroProps {
  /**
   * A real Card pulled server-side from /bcc/v1/cards. Null when the
   * API didn't return one (network failure, or the directory is empty
   * pre-launch). The demo-card section gracefully omits in that case.
   */
  featuredCard: Card | null;
}

export function FloorIntro({ featuredCard }: FloorIntroProps) {
  return (
    <section aria-label="Welcome to Blue Collar Crypto">
      <MarqueeBanner />
      <Hero />
      <Pillars />
      <LoopSteps />
      {featuredCard !== null && <DemoCard card={featuredCard} />}
      <ClosingCta />
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 0. MarqueeBanner — slow horizontal ticker at the very top, edge-to-
//    edge above the hero. Establishes the "not-for-sale" positioning
//    before the H1 lands. Eight items in rotation: six "✕ NOT AVAILABLE"
//    wedge lines and two italic sigils as visual rhythm breaks. Pure
//    decoration (aria-hidden); the wedge is also delivered statically
//    in NotStrip and Pillars, so AT users don't miss it.
// ──────────────────────────────────────────────────────────────────────

interface MarqueeItem {
  /** Mark prefix: "✕" for the wedge, "—" for an italic sigil. */
  mark: "✕" | "—";
  body: string;
}

const MARQUEE_ITEMS: readonly MarqueeItem[] = [
  { mark: "✕", body: "PAID PLACEMENT — NOT AVAILABLE" },
  { mark: "✕", body: "SPONSORED GRADES — NOT AVAILABLE" },
  { mark: "—", body: "REPUTATION YOU CAN'T BUY" },
  { mark: "✕", body: "BOUGHT CHECKMARKS — NOT AVAILABLE" },
  { mark: "✕", body: "BOT REVIEWS — NOT AVAILABLE" },
  { mark: "—", body: "BUILT IN PUBLIC" },
  { mark: "✕", body: "FOLLOWER PADDING — NOT AVAILABLE" },
  { mark: "✕", body: "FAKE ENDORSEMENTS — NOT AVAILABLE" },
] as const;

function MarqueeBanner() {
  // Render the items twice in a single track so a translateX(-50%)
  // animation loops seamlessly. Decorative-only (no semantic content
  // beyond what the static sections below carry).
  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];
  return (
    <div aria-hidden="true" className="bcc-marquee">
      <div className="bcc-marquee-track">
        {doubled.map((item, idx) => (
          <span
            key={idx}
            className="bcc-mono flex items-center gap-3 whitespace-nowrap text-cardstock-deep"
          >
            <span
              aria-hidden
              className={item.mark === "✕" ? "text-safety" : "text-cardstock"}
            >
              {item.mark}
            </span>
            <span
              className={item.mark === "—" ? "italic text-cardstock" : ""}
            >
              {item.body}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 1. Hero — the 3-second elevator pitch. Concrete bg already supplies
//    grain + scan-lines + radial glows from globals.css body styles,
//    so this block stays compositionally light. The standfirst carries
//    a stencil drop cap (.bcc-dropcap) — a small editorial flourish that
//    elevates the lede out of body-paragraph territory.
// ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <div className="mx-auto max-w-[1560px] px-6 pb-14 pt-14 sm:pt-20 lg:px-8">
      <div className="flex items-center gap-3">
        <span aria-hidden className="bcc-rail-dot" />
        <p className="bcc-mono text-safety">FLOOR &nbsp;//&nbsp; OPEN</p>
      </div>

      <h1 className="bcc-stencil mt-5 text-cardstock leading-[0.92] text-[clamp(2.75rem,9vw,7rem)]">
        REPUTATION
        <br />
        YOU CAN&rsquo;T <span className="text-safety">BUY.</span>
      </h1>

      <p className="bcc-dropcap mt-7 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep sm:text-xl">
        You can&rsquo;t buy a checkmark here. You can&rsquo;t pay for
        a tier. You can&rsquo;t sponsor a grade. The only currency on
        the floor is the work you actually did.
      </p>

      <div className="mt-9 flex flex-wrap gap-3">
        <Link href="/signup" className="bcc-btn bcc-btn-primary">
          Join the Floor
        </Link>
        <Link href="/login" className="bcc-btn bcc-btn-ghost">
          Sign In
        </Link>
      </div>

      {/* Caution-tape strip: a 6px slice that says "this is a working
          surface, not a pitch deck" — flush left, doesn't span. */}
      <div aria-hidden className="bcc-caution-tape mt-12 h-1.5 w-40 opacity-80" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 2. Pillars — three claims, one sentence each. What BCC stands FOR
//    (and implicitly, what it stands AGAINST: paid placement, sybils,
//    closed-door grading).
// ──────────────────────────────────────────────────────────────────────

interface Pillar {
  kicker: string;
  title: string;
  copy: string;
}

const PILLARS: readonly Pillar[] = [
  {
    kicker: "01",
    title: "Earned, Not Bought",
    copy: "No paid placement. No sponsored grades. No buying your way to legendary. Every mark on your card came from a real person who actually worked with you.",
  },
  {
    kicker: "02",
    title: "Verified Human",
    copy: "Wallet on-chain. History on file. Community vouching baked in. Bot farms can't fake their way into a real reputation here — they have nothing real to fake from.",
  },
  {
    kicker: "03",
    title: "Built in Public",
    copy: "Every review, every dispute, every endorsement — on the record. No back-room moderation. No silent shadowbans. The floor sees everything, and so do you.",
  },
] as const;

function Pillars() {
  return (
    <div className="mx-auto max-w-[1560px] border-y border-cardstock/10 px-6 py-14 lg:px-8">
      <div className="grid gap-12 md:grid-cols-3 md:gap-10">
        {PILLARS.map((pillar, i) => (
          <div
            key={pillar.kicker}
            className={
              i > 0
                ? "md:border-l md:border-dashed md:border-cardstock/15 md:pl-10"
                : ""
            }
          >
            <span className="bcc-stencil block text-5xl text-safety">
              {pillar.kicker}
            </span>
            <h3 className="bcc-stencil mt-2 text-2xl text-cardstock">
              {pillar.title}
            </h3>
            <p className="mt-3 max-w-sm font-serif leading-relaxed text-cardstock-deep">
              {pillar.copy}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3. LoopSteps — the §O1 product loop, framed as "THE TRUST ENGINE" on
//    screen. Five paper chips on the concrete, each a verb in the
//    sequence Discover → Signal → Record → Compound → Access. Crypto-
//    native voice on purpose: SIGNAL maps to the real backend verbs
//    (POST /bcc-trust/v1/vote, /endorse, /dispute), COMPOUND points at
//    weighted-reputation scoring, ACCESS at FeatureAccessService gates.
// ──────────────────────────────────────────────────────────────────────

interface LoopStep {
  n: string;
  verb: string;
  line: string;
}

const LOOP: readonly LoopStep[] = [
  { n: "01", verb: "Discover", line: "Find real operators doing real work." },
  { n: "02", verb: "Signal",   line: "Vote, endorse, or dispute." },
  { n: "03", verb: "Record",   line: "Everything is tracked. Nothing disappears." },
  { n: "04", verb: "Compound", line: "Your accuracy builds your weight." },
  { n: "05", verb: "Access",   line: "Higher trust unlocks reviews, disputes, and endorsements." },
] as const;

function LoopSteps() {
  return (
    <div className="mx-auto max-w-[1560px] px-6 py-16 lg:px-8">
      <p className="bcc-mono text-safety">THE TRUST ENGINE</p>
      <h2 className="bcc-stencil mt-2 text-cardstock text-4xl sm:text-5xl">
        Proof over promises. Always.
      </h2>
      <p className="mt-3 max-w-xl font-serif leading-relaxed text-cardstock-deep">
        Five moves. The chain remembers everything. Your signal earns
        its weight.
      </p>

      <ol className="mt-10 grid gap-4 md:grid-cols-5">
        {LOOP.map((step, i) => (
          <li
            key={step.n}
            className="bcc-paper bcc-stage-reveal p-5"
            style={{ ["--stagger" as string]: `${i * 90}ms` }}
          >
            <div className="relative z-[2]">
              <span className="bcc-mono text-ink-ghost">STEP {step.n}</span>
              <h3 className="bcc-stencil mt-1 text-3xl text-ink">
                {step.verb}.
              </h3>
              <p className="mt-2 font-serif leading-snug text-ink-soft">
                {step.line}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 4. DemoCard — a real Card from /bcc/v1/cards. The aesthetic IS the
//    pitch; rendering a real operator is more honest than a mock.
//
//    Layout: card on the left, instructional callouts on the right.
//    Stacks on mobile. The card itself handles flip + tilt + foil; we
//    just frame it with three short bullets that prime the visitor on
//    HOW to interact with it.
// ──────────────────────────────────────────────────────────────────────

interface InstructionRow {
  label: string;
  copy: React.ReactNode;
}

const DEMO_INSTRUCTIONS: readonly InstructionRow[] = [
  {
    label: "CLICK",
    copy: (
      <>
        Flip the card. Front shows the operator. Back shows the receipts
        — every grade, every review, every dispute.
      </>
    ),
  },
  {
    label: "HOVER",
    copy: <>Tilt it. Every card on the floor has weight.</>,
  },
  {
    label: "EARN",
    copy: (
      <>
        Sign up, do the work, and your <em className="text-cardstock">own</em> card
        mints right here. Same shape — your name on the front.
      </>
    ),
  },
] as const;

function DemoCard({ card }: { card: Card }) {
  return (
    <div className="mx-auto max-w-[1560px] px-6 py-16 lg:px-8">
      <p className="bcc-mono text-safety">EXHIBIT A</p>
      <h2 className="bcc-stencil mt-2 text-cardstock text-4xl sm:text-5xl">
        A verified human, on the record.
      </h2>
      <p className="mt-3 max-w-2xl font-serif leading-relaxed text-cardstock-deep">
        This is what a credential looks like when you can&rsquo;t buy
        it. Wallet signed. History on file. Reviews from real members.
        Grades earned in public &mdash; receipts attached.
      </p>

      <div className="mt-12 grid items-center gap-12 lg:grid-cols-[auto_1fr] lg:gap-16">
        <div className="flex flex-col items-center gap-3 lg:items-start">
          <CardFactory card={card} />
          <p className="bcc-mono text-cardstock-deep">
            FIG. 1 &middot; SPECIMEN OF RECORD
          </p>
        </div>

        <ul className="space-y-7 font-serif">
          {DEMO_INSTRUCTIONS.map((row) => (
            <li key={row.label} className="flex items-baseline gap-5">
              <span className="bcc-mono shrink-0 text-weld">{row.label}</span>
              <span className="leading-relaxed text-cardstock-deep">
                {row.copy}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 5. ClosingCta — last call before the eye lands on the live feed.
//    Centered for a clean break from the left-aligned blocks above.
//    The handwritten "signed, the floor" stamp is a deliberate visual
//    sign-off — the brand subtitle "signed on-chain" rendered in actual
//    handwriting (Homemade Apple) gives the closing block character
//    without breaking the typographic system.
// ──────────────────────────────────────────────────────────────────────

function ClosingCta() {
  return (
    <div className="mx-auto max-w-[1560px] px-6 py-20 text-center lg:px-8">
      <p className="bcc-mono text-safety">SHIFT START</p>
      <h2 className="bcc-stencil mt-3 text-cardstock leading-[0.95] text-[clamp(2.5rem,6vw,5rem)]">
        Step onto the floor.
      </h2>
      <p className="mx-auto mt-4 max-w-xl font-serif leading-relaxed text-cardstock-deep">
        Free to join. Free to read. Sign your first review and start
        building a record nobody can buy.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/signup" className="bcc-btn bcc-btn-primary">
          Join the Floor
        </Link>
        <Link href="/login" className="bcc-btn bcc-btn-ghost">
          Sign In
        </Link>
      </div>

      <span
        aria-hidden
        className="bcc-script mt-10 inline-block text-2xl text-cardstock-deep/80"
        style={{ transform: "rotate(-2deg)" }}
      >
        — signed, the floor
      </span>
    </div>
  );
}
