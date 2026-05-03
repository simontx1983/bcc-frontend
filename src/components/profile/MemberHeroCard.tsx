"use client";

/**
 * MemberHeroCard — the legendary member trading card that anchors a
 * profile hero. Distinct from <CardFactory>: this is a STATIC hero
 * treatment (no flip — the back face has nothing the profile body
 * doesn't already say), with a fixed-legendary visual treatment
 * lifted from member-profile-prototype.html.
 *
 * Why a separate component instead of a CardFactory variant:
 *   - The card chrome here is unique to the hero (foil top band,
 *     chevron tier ribbon, rotated stamp, legendary border glow).
 *   - Removing flip/click-to-flip simplifies a11y — no aria-pressed
 *     state confusion when the user clicks the page background.
 *   - Future "shareable card" exports lean on this shape.
 *
 * Hover tilt is preserved (parallax sells the "trading card on a
 * table" feeling), gated on prefers-reduced-motion.
 */

import { type CSSProperties, type MouseEvent, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { Card } from "@/lib/api/types";

export function MemberHeroCard({ card }: { card: Card }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Mirror CardFactory's tilt math so the hover feels consistent
  // across surfaces. ±8°/±7° peak rotation.
  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || ref.current === null) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const ry = (x - 0.5) * 16;
    const rx = (0.5 - y) * 14;
    ref.current.style.setProperty("--bcc-rx", `${rx}deg`);
    ref.current.style.setProperty("--bcc-ry", `${ry}deg`);
  };
  const onLeave = () => {
    if (ref.current === null) return;
    ref.current.style.setProperty("--bcc-rx", "0deg");
    ref.current.style.setProperty("--bcc-ry", "0deg");
  };

  // The hero card is hard-locked legendary visuals. We still respect
  // the §2.9 crest background so different members read as belonging
  // to different chains (V1.5) or tiers (V1).
  const chainStyle: CSSProperties = (() => {
    const { background_kind, background_value } = card.crest;
    if (background_value === "") return {};
    if (background_kind === "chain") {
      return { ["--bcc-chain-color" as string]: `var(--chain-${background_value})` };
    }
    if (background_kind === "tier") {
      return { ["--bcc-chain-color" as string]: `var(--tier-${background_value})` };
    }
    if (background_kind === "solid") {
      return { ["--bcc-chain-color" as string]: background_value };
    }
    return {};
  })();

  return (
    <div className="bcc-card-stage" style={chainStyle}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="bcc-card relative"
        style={{
          gridTemplateRows: "54px 1fr 96px 44px",
          // Override the generic .bcc-card-face backgrounds — we want
          // the legendary border treatment on the wrapper, not flipping
          // faces. Keep dimensions in sync with CardFactory.
          background: "var(--paper)",
          color: "var(--ink)",
          borderRadius: "6px",
          border: "3px solid var(--tier-legendary)",
          boxShadow: [
            "0 0 0 1px rgba(217, 164, 0, 0.7) inset",
            "0 0 30px rgba(255, 192, 30, 0.35)",
            "0 20px 40px -10px rgba(0, 0, 0, 0.85)",
          ].join(", "),
          display: "grid",
          overflow: "hidden",
          transition: "transform 0.2s cubic-bezier(.2,.9,.25,1)",
        }}
        role="img"
        aria-label={`Legendary member card for ${card.name}`}
      >
        <FoilBand cardKind={card.card_kind.toUpperCase()} />
        <Portrait card={card} />
        <NameStrip name={card.name} handle={card.handle} />
        <StatsRow stats={card.stats} />

        {/* Tier ribbon — pinned to the upper-left edge with a chevron clip */}
        <span className="bcc-tier-ribbon absolute left-[-6px] top-[66px] z-[6]">
          {card.tier_label ?? "LEGENDARY"}
        </span>

        {/* Verified-member stamp — pinned bottom-right, rotated 4° */}
        <span className="bcc-stamp absolute bottom-[110px] right-2 z-[6]">
          <span>VERIFIED</span>
          <strong>MEMBER</strong>
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components — kept inline because they only mean something in the
// hero context. Promote when a second consumer appears.
// ─────────────────────────────────────────────────────────────────────

function FoilBand({ cardKind }: { cardKind: string }) {
  return (
    <div
      className="bcc-foil-band-flat bcc-stencil relative z-10 flex items-center justify-between px-4"
      style={{ fontSize: "22px", letterSpacing: "0.06em" }}
    >
      <span>LEGENDARY</span>
      <span
        className="bcc-mono"
        style={{
          fontSize: "9px",
          padding: "3px 7px",
          border: "1px solid rgba(15, 13, 9, 0.5)",
          fontWeight: 500,
        }}
      >
        {cardKind}
      </span>
    </div>
  );
}

function Portrait({ card }: { card: Card }) {
  return (
    <div
      className="relative z-10 flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.22) 0%, transparent 60%), " +
          "linear-gradient(180deg, var(--bcc-chain-color, var(--chain-cosmos)) 0%, color-mix(in srgb, var(--bcc-chain-color, var(--chain-cosmos)) 55%, #000) 100%)",
      }}
    >
      <Crest initials={card.crest.initials} monogramColor={card.crest.monogram_color} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1.5px)",
          backgroundSize: "6px 6px",
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}

function Crest({ initials, monogramColor }: { initials: string; monogramColor: string }) {
  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        width: "140px",
        height: "160px",
        filter: "drop-shadow(0 6px 8px rgba(0, 0, 0, 0.5))",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: "var(--cardstock)",
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        }}
      />
      <span
        aria-hidden
        className="absolute"
        style={{
          inset: "10px",
          background: "var(--cardstock-deep)",
          clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
        }}
      />
      <span
        className="bcc-stencil relative z-[2]"
        style={{
          fontSize: "76px",
          lineHeight: 0.9,
          color: monogramColor,
          letterSpacing: "-0.04em",
        }}
      >
        {initials}
      </span>
    </div>
  );
}

function NameStrip({ name, handle }: { name: string; handle: string }) {
  return (
    <div
      className="relative z-10 flex flex-col justify-center bg-cardstock"
      style={{
        padding: "10px 14px 6px",
        borderTop: "3px solid var(--ink)",
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 right-0"
        style={{ top: "-6px", height: "3px", background: "var(--tier-legendary)" }}
      />
      <span
        className="bcc-stencil text-ink"
        style={{ fontSize: "28px", lineHeight: 0.95, letterSpacing: "0.01em" }}
      >
        {name}
      </span>
      <span
        className="text-ink-soft"
        style={{ fontFamily: "var(--font-fraunces), serif", fontStyle: "italic", fontSize: "12px", marginTop: "2px" }}
      >
        @{handle}
      </span>
    </div>
  );
}

function StatsRow({ stats }: { stats: Card["stats"] }) {
  // Hero card front shows up to 3 stats; the profile body reveals the
  // full picture so the card stays uncluttered.
  const visible = stats.slice(0, 3);
  return (
    <div
      className="relative z-10 grid grid-cols-3 bg-cardstock-deep"
      style={{ borderTop: "1px solid var(--ink)" }}
    >
      {visible.map((stat, i) => (
        <div
          key={stat.key}
          className="bcc-mono text-center text-ink-soft"
          style={{
            padding: "6px 8px",
            borderRight: i < visible.length - 1 ? "1px solid rgba(15,13,9,0.3)" : "none",
            fontFeatureSettings: "'tnum' 1",
          }}
        >
          <div style={{ fontSize: "8px", letterSpacing: "0.2em" }}>{stat.label.toUpperCase()}</div>
          <div
            className="text-ink"
            style={{ fontSize: "18px", fontWeight: 700, lineHeight: 1.2, marginTop: "1px" }}
          >
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

