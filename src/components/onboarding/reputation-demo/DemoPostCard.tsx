"use client";

/**
 * DemoPostCard — a view-only stand-in for a real home-feed post card
 * (mirrors `FeedItemCard`'s markup/classes so it stays visually
 * identical), driven entirely by the active `ReputationDemoCombo`. Fake
 * data only — never imports `FeedItemCard`/`ReactionRail`/`AuthorBadge`
 * directly, so no fake id ever reaches a real API client.
 *
 * Border color is local to this demo only — the real `FeedItemCard`
 * doesn't get colored borders yet (task 4, gated on elite-rarity
 * hardening).
 *
 * The card grows/shrinks in HEIGHT as the caption length changes between
 * combos, never in width (the column width is fixed by the parent) — the
 * caption wrapper's height is JS-measured and CSS-transitioned (`height:
 * auto` can't be transitioned directly). `min-w-0` on this card matters:
 * without it, a flex-item ancestor would let long unbroken text push the
 * card wider instead of wrapping.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { ActionRailButton } from "@/components/feed/ActionRailButton";
import { ReplyIcon, ShareIcon } from "@/components/feed/actionIcons";
import { StokeFlame } from "@/components/feed/StokeFlame";
import { Avatar } from "@/components/identity/Avatar";
import { RankChip } from "@/components/profile/RankChip";
import type { ReputationDemoCombo } from "@/components/onboarding/reputation-demo/combos";

const STOKE_FLAME_BOX = 22;

export function DemoPostCard({
  combo,
  /** Bumped by the parent each time the combo advances — replays the
   * stoke burst "as if just clicked" in sync with the swap. 0 = no burst
   * (first render / reduced motion, where it never advances). */
  burstKey,
  reducedMotion,
}: {
  combo: ReputationDemoCombo;
  burstKey: number;
  reducedMotion: boolean;
}) {
  const captionRef = useRef<HTMLParagraphElement>(null);
  const [captionHeight, setCaptionHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = captionRef.current;
    if (el === null) return;
    setCaptionHeight(el.scrollHeight);
  }, [combo.caption]);

  return (
    <div
      className="bcc-panel flex min-w-0 flex-col gap-3 p-3.5 pb-2.5 sm:p-4 sm:pb-3"
      style={{
        borderColor: combo.borderColor ?? "var(--bcc-border)",
        transition: "border-color 400ms ease",
      }}
    >
      <header className="flex items-start gap-2.5">
        <Avatar avatarUrl={null} handle="demo-operator" displayName="Demo Operator" size="sm" variant="rounded" />
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="bcc-stencil truncate text-[var(--bcc-text)]">Demo Operator</span>
          </div>
          <span className="bcc-mono truncate text-[11px] leading-tight text-[var(--bcc-text-secondary)]">
            @demo-operator
          </span>
        </div>
        <span
          key={reducedMotion ? "static" : combo.id}
          className={reducedMotion ? "" : "bcc-rep-demo-swap"}
        >
          <RankChip
            reputationTier={combo.reputationTier}
            tierLabel={combo.tierLabel}
            rankLabel={combo.rankLabel}
            isForeman={combo.isForeman}
            size="compact"
          />
        </span>
      </header>

      {/* Height-morph wrapper — width stays fixed (the parent column), only
          the measured height transitions as the caption's own scrollHeight
          changes between combos. Skipped under reduced motion so there's
          no layout-shift animation, just an instant swap. */}
      <div
        style={
          reducedMotion || captionHeight === undefined
            ? undefined
            : { height: captionHeight, overflow: "hidden", transition: "height 400ms ease" }
        }
      >
        <p
          ref={captionRef}
          key={reducedMotion ? "static-caption" : `caption-${combo.id}`}
          className={
            "font-serif text-[13px] leading-snug text-[var(--bcc-text)] " +
            (reducedMotion ? "" : "bcc-rep-demo-swap")
          }
        >
          {combo.caption}
        </p>
      </div>

      <footer className="flex items-center gap-1 border-t border-[var(--bcc-border)] pt-2">
        <span className="bcc-stoke-button relative inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2 py-0.5">
          <StokeFlame
            boxSize={STOKE_FLAME_BOX}
            flameSize={20}
            color="var(--bcc-secondary)"
            outline={false}
            glowOpacity={0.3}
            burstKey={burstKey}
            particleRadius={18}
          />
          <span className="bcc-mono text-[11px]" style={{ color: "var(--bcc-secondary)" }}>
            <span className="hidden sm:inline">Stoke</span> {combo.stokeCount}
          </span>
        </span>
        <ActionRailButton
          icon={<ReplyIcon />}
          label="Comment"
          count={combo.commentCount}
          hoverClassName="hover:text-[var(--bcc-info)]"
          ariaLabel="Comment (demo, view-only)"
          soon
        />
        <ActionRailButton
          icon={<ShareIcon />}
          label="Share"
          count={combo.shareCount}
          hoverClassName="hover:text-[var(--bcc-success)]"
          ariaLabel="Share (demo, view-only)"
          soon
        />
      </footer>
    </div>
  );
}
