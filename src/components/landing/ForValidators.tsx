/**
 * ForValidators — the page we send to validator operators we contact cold.
 *
 * ⚠ The reader's reasonable first assumption is that this is phishing, so
 * the structure is the safeguard and "simplifying" it undoes the point:
 *
 *   - NO wallet connection or signing on this page. It links to search and
 *     nothing else. The signature happens later, on the operator's own
 *     validator page, after they've chosen to go there.
 *   - No urgency, counts or "people are waiting". Followers read 0 on an
 *     unclaimed page and nothing surfaces a waiting-message count, so the
 *     copy says what CAN happen, never what has.
 *   - The exact wallet prompt is printed so it can be compared. It must stay
 *     word for word with `WalletChallenge::PREFIX` in bcc-core.
 *   - No trust score weights (see ReputationSummaryPanel) and nothing about
 *     price (BCC is never about price).
 *
 * The supported-chains list reads `isChainClaimable`, the same answer
 * ClaimFlow acts on, so the page can't promise a chain the flow refuses.
 */

import Image from "next/image";

import { LandingReveal } from "@/components/landing/LandingReveal";
import { LEGAL } from "@/lib/legal/config";
import { VALIDATOR_CHAIN_CATALOG } from "@/lib/validators/chain-catalog";
import { isChainClaimable } from "@/lib/wallet/claim-support";

/** Displayed location. Deliberately not the street address in legal config. */
const LOCATION = "Fort Worth, Texas";

interface Person {
  name: string;
  /** Under /public. Must be stripped of EXIF: phone photos can carry GPS. */
  photo: string;
  /** Public profile an operator can check independently (X, GitHub…). */
  profileUrl?: string;
}

/**
 * A named person is the strongest signal this page has, so every entry must be
 * real. Never add placeholder or invented details.
 */
const PEOPLE: ReadonlyArray<Person> = [
  { name: "Phillip S", photo: "/images/team/phillip-s.jpg" },
];

const SAFETY_POINTS: ReadonlyArray<string> = [
  "We will never ask for your seed phrase or private key. Anyone who does is not us.",
  "Claiming never sends a transaction and never asks for gas or funds. It is one free signature.",
  "The only address is bluecollarcrypto.io. If you're unsure about a link, type the address yourself.",
  "Claiming publicly links your Blue Collar Crypto account to your validator.",
];

const CLAIM_STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Find your page", body: "Search by your validator's name and open its page." },
  { title: "Create a free account", body: "Or sign in, if you already have one." },
  {
    title: "Connect your wallet",
    body: "Use the account behind your validator: the operator key on Cosmos chains, the stash account on Polkadot. Many operators keep this key offline, so take the time you need.",
  },
  { title: "Sign the message", body: "We match the signature against your on-chain address. If they match, the page is yours." },
];

const OWNER_TOOLS: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Your profile", body: "Write the bio and set the avatar your delegators see." },
  { title: "Your voice", body: "Post as your validator and publish announcements in your stream." },
  { title: "Your badge", body: "A verified operator badge on your page and your posts." },
  { title: "Your inbox", body: "Direct messages from the people who want to reach you." },
  { title: "Your dashboard", body: "Every validator page you run, in one place." },
];

const TIERS = "Risky, Caution, Neutral, Trusted and Elite";

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Why do I have a page I didn't ask for?",
    a: "We build a page for validators from public chain data, so people have one place to look them up. Nothing on it comes from you until you claim it.",
  },
  {
    q: "Do I have to claim it?",
    a: "No. Nothing is required of you, and the page stays up, marked unclaimed.",
  },
  {
    q: "Is there a token? Does this cost anything?",
    a: "There is no Blue Collar Crypto token, and claiming and using the page are free. We don't handle funds and we never initiate transactions.",
  },
  {
    q: "How do I know this is really you?",
    a: `Don't take a link's word for it. Type bluecollarcrypto.io yourself, read our terms to see the company behind the site, and email ${LEGAL.legalEmail} if anything looks off. The wallet prompt should match the text on this page exactly.`,
  },
];

export function ForValidators() {
  const claimNow = VALIDATOR_CHAIN_CATALOG.filter((c) => isChainClaimable(c.slug));
  const notYet = VALIDATOR_CHAIN_CATALOG.filter((c) => !isChainClaimable(c.slug));

  return (
    <div className="bcc-ldg-root">
      <div className="bcc-ldg-field" aria-hidden>
        <div className="bcc-ldg-field-grid" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g1" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g2" />
      </div>

      <div className="bcc-ldg-wrap">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section id="find" className="bcc-ldg-section">
          <p className="bcc-ldg-eyebrow">For validators</p>
          <h1 className="bcc-ldg-disp text-5xl text-bcc-text sm:text-7xl">
            Your validator already has a page here.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-bcc-text-secondary">
            We build these from public chain data. You don&rsquo;t need to do
            anything. If you want to run yours, claiming is free and takes one
            signature.
          </p>

          <form method="GET" action="/validators" className="mt-8 flex max-w-xl flex-wrap gap-3">
            <label htmlFor="for-validators-q" className="sr-only">
              Your validator&rsquo;s name
            </label>
            <input
              id="for-validators-q"
              name="q"
              type="search"
              required
              placeholder="Your validator's name"
              className="min-w-0 flex-1 rounded-sm border border-bcc-border bg-bcc-surface px-4 py-3 text-bcc-text focus:outline-none focus:ring-2 focus:ring-bcc-accent"
            />
            <button type="submit" className="bcc-ldg-btn bcc-ldg-btn-primary">
              Find your validator
            </button>
          </form>
        </section>

        {/* ── Safety — deliberately before any pitch ───────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">
            Before you do anything
          </LandingReveal>
          <LandingReveal as="h2" className="bcc-ldg-disp text-4xl text-bcc-text sm:text-5xl">
            You&rsquo;re right to be careful.
          </LandingReveal>
          <ul className="mt-6 max-w-3xl space-y-3 text-bcc-text-secondary">
            {SAFETY_POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <span aria-hidden>·</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 max-w-3xl rounded-sm border border-bcc-border bg-bcc-surface p-5">
            <p className="text-bcc-text">This is exactly what your wallet will show:</p>
            <p className="bcc-mono mt-3 break-words text-sm text-bcc-text-secondary">
              Sign this message to verify your wallet on Blue Collar Crypto.
              Nonce: &lt;a random code&gt; [&lt;your chain&gt;]
            </p>
            <p className="mt-3 text-bcc-text-secondary">
              If your wallet asks you to approve anything else, stop and{" "}
              <a href={`mailto:${LEGAL.legalEmail}`} className="underline">tell us</a>.
            </p>
          </div>
        </section>

        {/* ── Who we are ───────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">Who we are</LandingReveal>
          <p className="max-w-3xl text-lg leading-relaxed text-bcc-text-secondary">
            Blue Collar Crypto is run by {LEGAL.entity}, based in {LOCATION}. You
            can reach us at{" "}
            <a href={`mailto:${LEGAL.legalEmail}`} className="underline">{LEGAL.legalEmail}</a>.
          </p>
          <div className="bcc-ldg-pillars mt-8">
            {PEOPLE.map((person) => (
              <div key={person.name} className="bcc-ldg-pillar">
                <Image
                  src={person.photo}
                  alt={person.name}
                  width={320}
                  height={400}
                  className="w-full max-w-[220px] rounded-sm"
                />
                <h3>{person.name}</h3>
                <p>{LOCATION}</p>
                {person.profileUrl !== undefined && (
                  <a href={person.profileUrl} rel="noopener noreferrer" className="mt-3 inline-block underline">
                    Public profile
                  </a>
                )}
              </div>
            ))}
            <div className="bcc-ldg-pillar">
              <Image
                src="/images/team/bcc-logo.png"
                alt="Blue Collar Crypto logo"
                width={220}
                height={220}
                className="w-full max-w-[220px] rounded-sm"
              />
              <h3>{LEGAL.brand}</h3>
              <p>{LEGAL.entity}</p>
            </div>
          </div>
        </section>

        {/* ── What we do ───────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">What we do</LandingReveal>
          <p className="max-w-3xl text-lg leading-relaxed text-bcc-text-secondary">
            We&rsquo;re a place to look up crypto operators, build a public track
            record, and form communities around the work. It&rsquo;s never about
            price. We don&rsquo;t show one, and there&rsquo;s nothing here to buy.
          </p>
        </section>

        {/* ── Trust score ──────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">What the Trust Score means</LandingReveal>
          <LandingReveal as="h2" className="bcc-ldg-disp text-4xl text-bcc-text sm:text-5xl">
            A 50 means no evidence yet.
          </LandingReveal>
          <ul className="mt-6 max-w-3xl space-y-3 text-bcc-text-secondary">
            <li>Scores run from 0 to 100 and every page starts at 50. That isn&rsquo;t an average or a bad rating. It means nobody has weighed in yet.</li>
            <li>It moves with what people on the platform say about you and with on-chain signals, and it can go down as well as up. The tiers are {TIERS}.</li>
            <li>Claiming your page adds a small operator bonus, because you&rsquo;ve proved who you are.</li>
            <li>It isn&rsquo;t an uptime rating. Uptime and commission appear separately on your page.</li>
            <li>It can&rsquo;t be bought. There&rsquo;s no way to pay for a score, a tier or a badge.</li>
          </ul>
        </section>

        {/* ── How to claim ─────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">How to claim your page</LandingReveal>
          <div className="bcc-ldg-pillars">
            {CLAIM_STEPS.map((step, i) => (
              <div key={step.title} className="bcc-ldg-pillar">
                <div className="no">{i + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Community ────────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">Build your community</LandingReveal>
          <p className="max-w-3xl text-lg leading-relaxed text-bcc-text-secondary">
            People can follow your page and leave you messages. Those are kept
            and delivered to you when you claim it.
          </p>
          <div className="bcc-ldg-pillars mt-8">
            {OWNER_TOOLS.map((tool) => (
              <div key={tool.title} className="bcc-ldg-pillar">
                <h3>{tool.title}</h3>
                <p>{tool.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Chains ───────────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">Supported chains</LandingReveal>
          <p className="text-bcc-text">Claim now</p>
          <p className="mt-2 max-w-3xl text-bcc-text-secondary">
            {claimNow.map((c) => c.label).join(", ")}
          </p>
          <p className="mt-6 text-bcc-text">Not yet</p>
          <p className="mt-2 max-w-3xl text-bcc-text-secondary">
            {notYet.map((c) => c.label).join(", ")}
          </p>
          <p className="mt-4 max-w-3xl text-bcc-text-secondary">
            If your chain isn&rsquo;t ready, your page stays visible and
            there&rsquo;s nothing you need to do.
          </p>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <section className="bcc-ldg-section" style={{ paddingTop: 0 }}>
          <LandingReveal as="p" className="bcc-ldg-eyebrow">Questions</LandingReveal>
          <dl className="max-w-3xl space-y-6">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-semibold text-bcc-text">{item.q}</dt>
                <dd className="mt-1 text-bcc-text-secondary">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
