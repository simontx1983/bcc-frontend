"use client";

/**
 * WelcomeStep — the first onboarding screen. Sets the tone, frames what
 * the next minute looks like (a 3-card preview), and offers a clean
 * "Skip setup" escape that jumps straight to the send-off (which still
 * fires /complete, so the user lands onboarded either way).
 *
 * Pure presentation — no data. Styled on the `bcc-onb-*` page-chrome
 * namespace; the primary CTA uses the landing's magnetic-link behaviour.
 */

import { LandingReveal } from "@/components/landing/LandingReveal";

interface PreviewCard {
  n: string;
  title: string;
  body: string;
}

const PREVIEW: readonly PreviewCard[] = [
  {
    n: "01",
    title: "Set up your profile",
    body: "Add an avatar, a cover, and a line about yourself. Optional — you can do it later.",
  },
  {
    n: "02",
    title: "Learn the graph",
    body: "Sixty seconds on how reputation is earned here — back, stand behind, or dispute.",
  },
  {
    n: "03",
    title: "Pick who to watch",
    body: "Choose the validators, projects, and creators your Floor feed starts with.",
  },
] as const;

export function WelcomeStep({
  handle,
  onStart,
  onSkipAll,
}: {
  handle: string;
  onStart: () => void;
  onSkipAll: () => void;
}) {
  return (
    <section className="bcc-onb-step">
      <LandingReveal as="p" className="bcc-onb-eyebrow">
        Welcome to the floor
      </LandingReveal>
      <LandingReveal>
        <h1 className="bcc-onb-disp">
          You&rsquo;re in,
          <br />
          <span style={{ color: "var(--bcc-accent)" }}>@{handle}</span>.
        </h1>
        <p className="bcc-onb-lede">
          Blue Collar Crypto is an operator intelligence network — reputation you
          can&rsquo;t buy, earned in public. <b>Two minutes to set up your floor.</b>{" "}
          Every step is skippable.
        </p>
      </LandingReveal>

      <div className="bcc-onb-preview">
        {PREVIEW.map((card, i) => (
          <LandingReveal key={card.n} delayMs={i * 80} className="bcc-onb-pv">
            <div className="n">{card.n}</div>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </LandingReveal>
        ))}
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" onClick={onSkipAll} className="bcc-onb-link">
          Skip setup — take me to the floor
        </button>
        <button type="button" onClick={onStart} className="bcc-onb-btn bcc-onb-btn-primary">
          Let&rsquo;s go →
        </button>
      </footer>
    </section>
  );
}
