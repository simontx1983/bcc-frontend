/**
 * Avatar — unified identity primitive (Sprint 1 Identity Grammar).
 *
 * Replaces 11+ inline `function Avatar` definitions that drifted across
 * the codebase. Five sizes covering every social surface; two variants
 * (rounded circle, hex crest). Server-resolved tier drives an optional
 * tint via the existing `--tier-*` CSS variables — no new JS tier
 * table (that would be §A2 business-logic-on-FE).
 *
 * Tier prop note (load-bearing):
 *   `tier` is typed as `CardTier` (the server's pre-resolved card-tier
 *   slug — "legendary" | "rare" | "uncommon" | "common" | null).
 *   It is intentionally NOT `ReputationTier`. The reputation→card-tier
 *   mapping is server-owned (§A2 / §J.6); surfaces whose view-model
 *   only carries `reputation_tier` should pass `undefined` for `tier`
 *   and accept a neutral cardstock border until the BE ships
 *   `card_tier` on that view-model. Confirmed:
 *     - MemberProfile, BinderItem, MemberDirectoryRow ship card_tier
 *     - FeedAuthor, CommentAuthor, NotificationActor do NOT (Sprint 1
 *       blocker — see frontend-implementer report)
 *
 * Variants:
 *   - rounded — circle; comments, notifications, message threads,
 *               composer chip, settings rows.
 *   - hex     — triple-layer .bcc-hex crest; reserved for the binder
 *               surface (and any future "card-style" identity slots).
 *
 * Sizes (CSS px, matched to the surfaces in the audit):
 *   xs  20  reaction-stack avatars
 *   sm  28  comment rows, notification rows, feed cards, composer chips
 *   md  40  message previews, composer collapsed, prominent rows
 *   lg  64  members directory, attestation roster heroes
 *   xl  140 binder/profile hero (not used in Sprint 1; reserved)
 *
 * Behaviour:
 *   - Non-empty avatarUrl → <img loading="lazy"> in the variant shape
 *   - Empty/null avatarUrl → initials monogram via deriveInitials()
 *   - tier !== undefined/null → tinted ring/border via CSS var
 *   - isOperator (sm+) → tiny phosphor dot bottom-right
 *   - asLink → wraps in a Next <Link> to /u/{handle}
 *   - Any transition is gated by `motion-safe:` Tailwind variants
 *
 * Memoized at the export boundary — Avatar is rendered in dense lists
 * (rosters, comment threads, notification dropdowns) and stable
 * `member`/`comment` references should re-render skip.
 */

import { memo, type CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";

import { deriveInitials } from "@/lib/format/initials";
import type { CardTier } from "@/lib/api/types";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarVariant = "rounded" | "hex";

export interface AvatarProps {
  avatarUrl: string | null | undefined;
  handle: string;
  displayName?: string | null | undefined;
  size: AvatarSize;
  variant?: AvatarVariant | undefined;
  /**
   * Server-resolved card-tier slug. `undefined` = caller has no tier
   * signal (e.g., FeedAuthor); falls back to neutral cardstock border.
   * `null` = server-resolved risky tier (no tint, by design).
   */
  tier?: CardTier | undefined;
  /** §N8 operator dot — only renders on sm+ (xs is too small to host it). */
  isOperator?: boolean | undefined;
  /** When true, wraps the avatar in a `<Link>` to `/u/{handle}`. */
  asLink?: boolean | undefined;
  className?: string | undefined;
}

interface SizeSpec {
  /** Visible size in px (square). */
  px: number;
  /** Font class for initials. xs uses bcc-mono; sm+ uses bcc-stencil. */
  fontClass: string;
  /** Operator-dot pixel size + offset. */
  operatorPx: number;
}

const SIZE_TABLE: Record<AvatarSize, SizeSpec> = {
  xs: { px: 20,  fontClass: "bcc-mono text-[9px] tracking-tight",  operatorPx: 0 },
  sm: { px: 28,  fontClass: "bcc-stencil text-[11px]",              operatorPx: 6 },
  md: { px: 40,  fontClass: "bcc-stencil text-[14px]",              operatorPx: 8 },
  lg: { px: 64,  fontClass: "bcc-stencil text-[22px]",              operatorPx: 10 },
  xl: { px: 140, fontClass: "bcc-stencil text-[44px]",              operatorPx: 14 },
};

function AvatarImpl({
  avatarUrl,
  handle,
  displayName,
  size,
  variant = "rounded",
  tier,
  isOperator = false,
  asLink = false,
  className,
}: AvatarProps) {
  const spec = SIZE_TABLE[size];
  const initials = deriveInitials(displayName, handle);
  const hasImage = typeof avatarUrl === "string" && avatarUrl !== "";

  // Tier tint via the existing CSS vars (globals.css:37-40). No JS
  // tier→color map. `undefined` and `null` both fall back to a neutral
  // cardstock edge — visually equivalent, distinct semantically (one is
  // "no signal," the other is "risky tier, intentionally hidden").
  const tierColor: string | null =
    typeof tier === "string" ? `var(--tier-${tier})` : null;

  // Inline style holds the dynamic px size + tier color. Tailwind
  // arbitrary values would explode the JIT cache (5 sizes × every
  // surface), so we use inline styles for the literal dimensions and
  // class names for everything paintable.
  const sizePx = `${spec.px}px`;

  const wrapperStyle: CSSProperties = {
    width: sizePx,
    height: sizePx,
  };

  // The visible shape — circle (`rounded-full`) or hex (`.bcc-hex` +
  // its three nested layers). Both are border-bearing; the tier color
  // gets applied to the outer ring.
  const shapeBase = variant === "hex" ? "" : "rounded-full";

  // Border / ring driver. When we have a tier color, paint a 2px solid
  // ring of that color; otherwise a faint cardstock edge so the shape
  // is visible against any background. Hex variant has its own outer
  // ring built into .bcc-hex-outer — we still set CSS var so the mid
  // band can pick it up if the consumer wants chain coloration.
  const ringStyle: CSSProperties =
    variant === "hex"
      ? { ["--bcc-chain-color" as string]: tierColor ?? "var(--cardstock-edge)" }
      : {
          border:
            tierColor !== null
              ? `2px solid ${tierColor}`
              : "1px solid var(--cardstock-edge)",
        };

  const a11yName = (() => {
    if (typeof displayName === "string" && displayName !== "") return displayName;
    return `@${handle}`;
  })();

  // Build the inner avatar content (image OR initials). Hex variant
  // composes the three nested layers; rounded just renders directly
  // inside the bordered circle.
  // Hex variant composes the canonical `.bcc-hex` triple-layer from
  // globals.css:293-307. The clip-path is owned by `.bcc-hex-outer/mid/inner`
  // and clips descendants — so an `<img>` placed inside `.bcc-hex-inner`
  // is automatically clipped to the hex shape. Mirrors BinderTile.tsx's
  // composition (initials as z-[2] sibling); only difference is the
  // image branch puts the `<img>` inside the inner layer for clipping.
  const inner =
    variant === "hex" ? (
      <span
        className="bcc-hex relative flex h-full w-full items-center justify-center"
        aria-hidden={hasImage ? undefined : true}
      >
        <span className="bcc-hex-outer" aria-hidden />
        <span className="bcc-hex-mid" aria-hidden />
        <span className="bcc-hex-inner">
          {hasImage && (
            // eslint-disable-next-line @next/next/no-img-element -- avatars are remote PeepSo URLs; next/image would need per-tenant remotePatterns allow-list.
            <img
              src={avatarUrl as string}
              alt={a11yName}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </span>
        {!hasImage && (
          <span className={`relative z-[2] text-cardstock ${spec.fontClass}`}>
            {initials}
          </span>
        )}
      </span>
    ) : hasImage ? (
      // eslint-disable-next-line @next/next/no-img-element -- avatars are remote PeepSo URLs (legacy inline Avatars used the same exemption)
      <img
        src={avatarUrl as string}
        alt={a11yName}
        loading="lazy"
        className={`h-full w-full ${shapeBase} object-cover`}
      />
    ) : (
      <span
        className={`flex h-full w-full items-center justify-center ${shapeBase} bg-cardstock-deep text-cardstock ${spec.fontClass}`}
        aria-hidden
      >
        {initials !== "" ? initials : "?"}
      </span>
    );

  // Operator dot (sm+). Positioned bottom-right via absolute; relies
  // on the wrapper being `relative`. xs hides it — there's no room.
  const operatorDot =
    isOperator === true && size !== "xs" ? (
      <span
        aria-label="Verified operator"
        title="Verified operator/creator on at least one entity."
        className="absolute rounded-full"
        style={{
          right: 0,
          bottom: 0,
          width: spec.operatorPx,
          height: spec.operatorPx,
          background: "var(--phosphor, #b6ff5e)",
          boxShadow: "0 0 0 2px var(--cardstock)",
        }}
      />
    ) : null;

  const content = (
    <span
      className={`relative inline-block shrink-0 ${shapeBase} overflow-visible ${className ?? ""}`}
      style={{ ...wrapperStyle, ...ringStyle }}
    >
      <span
        className={`block h-full w-full ${shapeBase} overflow-hidden`}
      >
        {inner}
      </span>
      {operatorDot}
    </span>
  );

  if (asLink === true) {
    return (
      <Link
        href={`/u/${handle}` as Route}
        aria-label={a11yName}
        className="inline-block motion-safe:transition-opacity motion-safe:hover:opacity-90"
      >
        {content}
      </Link>
    );
  }

  return content;
}

export const Avatar = memo(AvatarImpl);
Avatar.displayName = "Avatar";
