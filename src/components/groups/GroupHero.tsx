/**
 * GroupHero — top of the §4.7.5 group-detail page.
 *
 * Renders the cover (CommunityCover for NFT image / initials block
 * fallback for non-NFT kinds), a mono kicker label, the stencil name,
 * the membership pill, and the metadata strip (verification + heat +
 * member count).
 *
 * Composition aligns with the brutalist primitives in `globals.css`
 * — no new fonts, no new palette. The `bcc-stage-reveal` animation is
 * gated globally by `prefers-reduced-motion: reduce` (globals.css:115),
 * so we don't add a manual gate.
 *
 * Server component — no interactive state lives here. The interactive
 * pieces (join/leave button, feed/roster) are siblings.
 */

import { CommunityCover } from "@/components/communities/CommunityCover";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type { GroupDetailResponse } from "@/lib/api/types";

const KICKER_BY_TYPE: Record<GroupDetailResponse["type"], string> = {
  nft:    "HOLDERS GROUP",
  local:  "LOCAL CHAPTER",
  system: "SYSTEM GROUP",
  user:   "COMMUNITY",
};

const PRIVACY_KICKER: Record<GroupDetailResponse["privacy"], string | null> = {
  open:   null,         // open is the default; no extra kicker
  closed: "PRIVATE",
  secret: "INVITE-ONLY",
};

export function GroupHero({ group }: { group: GroupDetailResponse }) {
  const kicker = KICKER_BY_TYPE[group.type];
  const privacyKicker = PRIVACY_KICKER[group.privacy];

  return (
    <header className="bcc-stage-reveal" style={{ ["--stagger" as string]: "0ms" }}>
      {/* Cover strip — full-width on the hero. CommunityCover expects an
          absolutely-positioned host so we wrap it in an aspect-ratio
          frame. NFT-kind groups carry an image_url; everything else
          renders the deterministic initials block. */}
      <div
        className="relative w-full overflow-hidden border border-cardstock-edge bg-concrete"
        style={{ aspectRatio: "5 / 2" }}
      >
        <CommunityCover
          imageUrl={group.image_url}
          name={group.name}
          groupId={group.id}
        />
        {/* Soft scrim so a stencil overlay (added later if needed)
            stays legible against any cover. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(15,13,9,0.0) 0%, rgba(15,13,9,0.0) 60%, rgba(15,13,9,0.55) 100%)",
          }}
        />
      </div>

      {/* Kicker + name + meta strip. */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <span
            className="bcc-mono uppercase text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            {kicker}
          </span>
          {privacyKicker !== null && (
            <span
              className="bcc-mono uppercase text-safety"
              style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            >
              · {privacyKicker}
            </span>
          )}
        </div>

        <h1
          className="bcc-stencil mt-2 text-cardstock"
          style={{
            fontSize: "clamp(36px, 6vw, 64px)",
            letterSpacing: "0.02em",
            lineHeight: 1.02,
          }}
        >
          {group.name}
        </h1>

        <div
          className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2"
        >
          {group.verification !== null && (
            <span className="bcc-mono text-[11px]">
              <VerificationBadge label={group.verification.label} />
            </span>
          )}
          <HeatBadge activity={group.activity} />
          <span
            className="bcc-mono text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            {group.member_count.toLocaleString()} MEMBER
            {group.member_count === 1 ? "" : "S"}
          </span>
        </div>

        {group.description !== null && group.description !== "" && (
          <p
            className="font-serif italic text-cardstock mt-5"
            style={{ fontSize: "17px", lineHeight: 1.55, maxWidth: "62ch" }}
          >
            {group.description}
          </p>
        )}
      </div>
    </header>
  );
}
