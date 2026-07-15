"use client";

/**
 * StokeFlame — the flame + resting glow + stoke-ON spark burst, shared by
 * the feed ReactionRail and the comment rail's CommentStokeButton (see
 * HANDOVER-comment-v2-polish.md Item 7 — the comment stoke previously had
 * none of this and read flat/dead next to the feed one). Purely
 * presentational: the caller owns `burstKey` (bump it on stoke-ON) and
 * the `.bcc-stoke-button` hover wrapper.
 */

import type { CSSProperties } from "react";

import { FlameIcon } from "@/components/feed/actionIcons";

function particleOffsets(radius: number, count: number): ReadonlyArray<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) };
  });
}

const PARTICLE_COUNT = 7;

export function StokeFlame({
  boxSize,
  flameSize,
  color,
  outline,
  glowOpacity,
  burstKey,
  particleRadius,
}: {
  /** Box the flame + glow are centered in — sized to the largest state so the icon never clips. */
  boxSize: number;
  flameSize: number;
  color: string;
  /** true = ash outline (not stoked); false = solid fill (stoked). */
  outline: boolean;
  glowOpacity: number;
  /** Bump on stoke-ON to fire a one-shot burst; 0 = no burst has fired yet. */
  burstKey: number;
  particleRadius: number;
}) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: boxSize, height: boxSize }}>
      <span
        aria-hidden
        className="bcc-stoke-glow pointer-events-none absolute rounded-full"
        style={
          {
            width: flameSize * 1.3,
            height: flameSize * 1.3,
            background: "var(--bcc-secondary-glow)",
            filter: "blur(3px)",
            "--bcc-stoke-rest-opacity": glowOpacity,
            "--bcc-stoke-hover-opacity": Math.min(1, glowOpacity + 0.2),
          } as CSSProperties
        }
      />
      {burstKey > 0 && (
        <span
          key={`burst-glow-${burstKey}`}
          aria-hidden
          className="bcc-stoke-burst-glow pointer-events-none absolute rounded-full motion-safe:animate-[bcc-stoke-burst-glow_650ms_ease-out]"
          style={{
            width: flameSize * 2.8,
            height: flameSize * 2.8,
            background: "var(--bcc-secondary-glow)",
            filter: "blur(8px)",
            opacity: 0,
          }}
        />
      )}
      <FlameIcon
        key={`flame-${burstKey}`}
        size={flameSize}
        color={color}
        outline={outline}
        className={
          "bcc-stoke-flame " +
          (burstKey > 0 ? "motion-safe:animate-[bcc-stoke-burst-scale_650ms_ease-out]" : "")
        }
      />
      {burstKey > 0 &&
        particleOffsets(particleRadius, PARTICLE_COUNT).map((offset, i) => (
          <span
            key={`particle-${burstKey}-${i}`}
            aria-hidden
            className="pointer-events-none absolute h-1 w-1 rounded-full motion-safe:animate-[bcc-stoke-particle_650ms_ease-out]"
            style={
              {
                background: "var(--bcc-secondary-light)",
                opacity: 0,
                "--bcc-stoke-particle-x": `${offset.x}px`,
                "--bcc-stoke-particle-y": `${offset.y}px`,
              } as CSSProperties
            }
          />
        ))}
    </span>
  );
}
