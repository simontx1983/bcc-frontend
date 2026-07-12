"use client";

/**
 * AdCarousel — prototype ad slot. Three placeholder "sponsored" slides
 * that cross-fade on a slow timer, standing in for a real ad network so
 * the slot reads as a live, designed placement instead of an empty box.
 * Swap the SLIDES array for real creatives (image URL + copy) when the ad
 * integration lands; the fade/rotation machinery stays.
 *
 * Reduced-motion: no rotation, no fade — the first slide holds static.
 */

import { useEffect, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface AdSlide {
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
  /** Token-based gradient — no literal colors (brand tokens only). */
  gradient: string;
}

const SLIDES: AdSlide[] = [
  {
    tag: "Sponsored",
    title: "Ship on-chain, faster",
    subtitle: "Deploy validator infra in minutes.",
    cta: "Learn more",
    gradient: "linear-gradient(135deg, var(--bcc-primary), var(--bcc-secondary))",
  },
  {
    tag: "Sponsored",
    title: "Your rig, your rules",
    subtitle: "Blue-collar tooling for builders.",
    cta: "Get started",
    gradient: "linear-gradient(135deg, var(--bcc-secondary), var(--bcc-accent))",
  },
  {
    tag: "Sponsored",
    title: "Earn on the Floor",
    subtitle: "Stake, watch, and get rewarded.",
    cta: "Join now",
    gradient: "linear-gradient(135deg, var(--bcc-accent), var(--bcc-primary))",
  },
];

const ROTATE_MS = 4500;

export function AdCarousel() {
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const id = window.setInterval(
      () => setActive((i) => (i + 1) % SLIDES.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-[var(--bcc-border)]">
      {SLIDES.map((slide, i) => (
        <div
          key={slide.title}
          aria-hidden={i !== active}
          className={
            "absolute inset-0 flex flex-col justify-between p-3.5 transition-opacity duration-700 " +
            (i === active ? "opacity-100" : "opacity-0")
          }
          style={{ backgroundImage: slide.gradient }}
        >
          <span className="bcc-mono w-fit rounded-full bg-ink/25 px-2 py-0.5 text-[9px] tracking-[0.18em] text-paper backdrop-blur-sm">
            {slide.tag.toUpperCase()}
          </span>
          <div className="flex flex-col gap-1">
            <span className="bcc-stencil text-[15px] leading-tight text-paper">{slide.title}</span>
            <span className="font-serif text-[11px] leading-snug text-paper/85">{slide.subtitle}</span>
            <span className="bcc-mono mt-1 w-fit rounded-full bg-paper/90 px-2.5 py-1 text-[10px] tracking-[0.14em] text-ink">
              {slide.cta.toUpperCase()} →
            </span>
          </div>
        </div>
      ))}

      {/* Dots */}
      <div className="absolute bottom-2 right-3 flex gap-1">
        {SLIDES.map((slide, i) => (
          <span
            key={slide.title}
            aria-hidden
            className={
              "h-1.5 w-1.5 rounded-full transition-colors " +
              (i === active ? "bg-paper" : "bg-paper/40")
            }
          />
        ))}
      </div>
    </div>
  );
}
