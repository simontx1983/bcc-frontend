/**
 * CardFrontFace — the front face of the trading card, plus its chrome
 * sub-components (CardHeader, Portrait, Nameplate, StatsPanel, the
 * unclaimed ribbon).
 *
 * The card is one uniform, theme-aware surface. The KIND COLOUR appears
 * in exactly three places on the whole card: the 3px top rule, the short
 * wash falling from it (both in globals.css), and the kind word in this
 * header row. Nothing else is tinted by kind — notably the portrait,
 * which is card surface plus a halftone, never a coloured panel.
 *
 * Behaviour change worth knowing: the old band took the CHAIN colour
 * whenever the crest was chain-keyed. The top rule always takes the
 * KIND colour now. Chain is a qualifier in the header pill, not the
 * card's identity.
 */

import type { Route } from "next";
import Link from "next/link";

import { ActionBar, CommunityActionBar } from "@/components/cards/CardActionBar";
import { OnchainSignalsStrip } from "@/components/cards/CardOnchainSignals";
import { CardStandingStrip } from "@/components/cards/CardStandingStrip";
import { Crest } from "@/components/cards/Crest";
import { RankChip } from "@/components/profile/RankChip";
import { ReliabilityStandingBadge } from "@/components/reliability/ReliabilityStandingBadge";
import { FOLLOW_COPY } from "@/lib/copy";
import type { Card, CardStat } from "@/lib/api/types";

/**
 * Audience counts live in the nameplate, not the stats grid — an audience
 * measure is not a trust output. Filtering by key keeps the grid to real
 * trust signals (Trust / Reviews / Vouches).
 *
 * `members` is in here for community cards: a community has no trust axis
 * at all (see below), so its head-count is the closest thing it has to an
 * audience number and belongs in the same slot every other kind uses.
 */
const AUDIENCE_STAT_KEYS = new Set(["followers", "watchers", "watching", "members"]);

/**
 * Split the server's stats into "the one that goes under the handle" and
 * "the grid", and give member cards the Vouches column they were missing.
 *
 * The server ships member cards `trust · reviews_written · watchers` and
 * entity cards `trust · followers · reviews · endorsements`, so once the
 * audience count moves to the nameplate a member card was left with only
 * two columns while an entity had three. The vouch count IS on the wire
 * for members, just on a different block — `member_dossier.engagement.
 * endorsements_received` — so this reads it into the missing column
 * rather than inventing or recomputing anything.
 */
function splitStats(card: Card): {
  audience: CardStat[];
  grid: CardStat[];
} {
  const audience = card.stats.filter((s) => AUDIENCE_STAT_KEYS.has(s.key));
  const grid = card.stats.filter((s) => !AUDIENCE_STAT_KEYS.has(s.key));

  const engagement = card.member_dossier?.engagement;
  if (
    card.card_kind === "member" &&
    engagement !== undefined &&
    !grid.some((s) => s.key === "endorsements")
  ) {
    grid.push({
      key: "endorsements",
      label: "Vouches",
      value: String(engagement.endorsements_received),
      raw: engagement.endorsements_received,
      format: "count",
    });
  }

  return { audience, grid };
}

export function CardFrontFace({
  card,
  kindColor,
  flipped,
  onFlip,
  onPull,
  isPulled,
  canEditAvatar,
  onJoin,
  isJoined = false,
  joinPending = false,
}: {
  card: Card;
  /** Resolved `var(--kind-*)` for this card's kind. */
  kindColor: string;
  flipped: boolean;
  onFlip: () => void;
  onPull?: ((card: Card) => void) | undefined;
  isPulled: boolean;
  canEditAvatar: boolean;
  onJoin?: ((card: Card) => void) | undefined;
  isJoined?: boolean | undefined;
  joinPending?: boolean | undefined;
}) {
  const isCommunity =
    card.card_kind === "community" && card.community_dossier != null;

  const { audience: audienceStats, grid: gridStats } = splitStats(card);

  return (
    <div className="bcc-card-face">
      {/* The card's single navigation target, covering the whole face
          beneath the interactive rows. typedRoutes can't statically
          prove a server-supplied path, so the cast is required — the
          backend owns these URLs (§A4). */}
      <Link
        href={card.links.self as Route}
        className="bcc-card-body-link"
        aria-label={`Open ${card.name}`}
      />

      <CardHeader card={card} kindColor={kindColor} />

      {/* Community cards never surface the avatar-upload affordance —
          group art is managed by the group owner surface, not here. */}
      <Portrait card={card} canEditAvatar={isCommunity ? false : canEditAvatar} />

      <Nameplate card={card} audienceStats={audienceStats} />

      {/* On-chain validator signals — what the operator actually does on
          chain, shown claimed or unclaimed so the card communicates real
          data even before a human owns the page. Null for other kinds. */}
      {card.onchain_signals != null && (
        <OnchainSignalsStrip signals={card.onchain_signals} />
      )}
      {/* No community signals strip here. It said the gate and the
          verification, which is exactly what the standing strip's T2 and
          T4 rows now say — printing both put "Private" on the card twice.
          The strip is the duplicate, so it goes. */}

      <StatsPanel stats={gridStats} />

      {isCommunity && card.community_dossier != null ? (
        <CommunityActionBar
          card={card}
          dossier={card.community_dossier}
          onJoin={onJoin}
          isJoined={isJoined}
          joinPending={joinPending}
        />
      ) : (
        <ActionBar card={card} onPull={onPull} isPulled={isPulled} />
      )}

      <CardStandingStrip
        card={card}
        kindColor={kindColor}
        flipped={flipped}
        onFlip={onFlip}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Front-face sub-components — kept inline; they share enough
// type-context that splitting into separate files would just add
// import noise. Promote later if any one grows past ~80 lines.
// ─────────────────────────────────────────────────────────────────────

/**
 * Chain slug for the header pill, or null.
 *
 * Validators carry it on the crest; communities carry it on the dossier.
 * There is deliberately NO fallback: the old band printed a literal
 * "BCC" whenever the crest wasn't chain-keyed, which put a meaningless
 * word in the card's most prominent slot. Empty means empty.
 */
function chainSlug(card: Card): string | null {
  if (card.card_kind === "community") {
    const tag = card.community_dossier?.chain_tag ?? null;
    return tag !== null && tag !== "" ? tag : null;
  }
  if (card.crest.background_kind === "chain" && card.crest.background_value !== "") {
    return card.crest.background_value;
  }
  return null;
}

/**
 * Header row — 46px. Kind word on the left, one optional element on the
 * right, resolved by kind:
 *
 *   member    → rank chip
 *   validator → chain pill, else nothing
 *   project   → nothing (projects have no chain and no rank)
 *   creator   → nothing
 *   community → chain pill if chain_tag, else nothing
 *
 * The kind word is a closed set of five, so it can never overflow.
 */
function CardHeader({ card, kindColor }: { card: Card; kindColor: string }) {
  const slug = chainSlug(card);
  const showChainPill =
    slug !== null && (card.card_kind === "validator" || card.card_kind === "community");
  const showRank = card.card_kind === "member" && card.rank_label !== null;

  return (
    <div className="relative z-[1] flex h-[46px] shrink-0 items-center justify-between px-4">
      <span
        className="bcc-stencil"
        style={{
          fontSize: 20,
          lineHeight: 1,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: kindColor,
        }}
      >
        {card.card_kind}
      </span>

      {showRank ? (
        <RankChip
          reputationTier={card.reputation_tier}
          tierLabel={card.reputation_tier_label ?? ""}
          rankLabel={card.rank_label ?? ""}
          size="card"
        />
      ) : showChainPill ? (
        <ChainPill slug={slug} />
      ) : null}
    </div>
  );
}

/**
 * Chain pill — a plain FACT about the page, so it carries no dot.
 *
 * The dot rule, product-wide: a dot means the chip is telling you
 * something about TRUST; no dot means it's stating a fact. Adding chain
 * dots would make users learn five trust dots plus an open-ended set of
 * chain dots.
 *
 * Weight 600 because mono at 9.5px with 0.17em tracking reads thin at
 * the default weight.
 */
function ChainPill({ slug }: { slug: string }) {
  const chain = `var(--chain-${slug})`;
  return (
    <span
      className="bcc-mono"
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.17em",
        textTransform: "uppercase",
        color: "var(--bcc-text-secondary)",
        background: `color-mix(in srgb, ${chain} 17%, transparent)`,
        border: `1px solid color-mix(in srgb, ${chain} 42%, transparent)`,
        borderRadius: 9999,
        padding: "2px 8px",
      }}
    >
      {slug}
    </span>
  );
}

/**
 * Portrait — the card's breathing room, and the flex: 1 child that
 * absorbs whatever height the standing strip gives back when it
 * collapses.
 *
 * Surface plus a halftone, nothing kind-coloured. There is no cover
 * photo: `cover_photo_url` isn't on `Card` yet. The slot is built
 * cover-ready but renders NOTHING until the field lands — deliberately
 * not a placeholder gradient.
 */
function Portrait({
  card,
  canEditAvatar,
}: {
  card: Card;
  canEditAvatar: boolean;
}) {
  const showRibbon = !card.is_claimed && card.claim_target !== null;

  return (
    <div className="relative z-[1] flex min-h-0 flex-1 items-center justify-center overflow-hidden">
      {/* Halftone — theme-aware via --card-dot, purely decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--card-dot) 1px, transparent 1.5px)",
          backgroundSize: "6px 6px",
        }}
      />
      <Crest card={card} canEditAvatar={canEditAvatar} />
      {showRibbon && <UnclaimedRibbon />}
    </div>
  );
}

/**
 * UnclaimedRibbon — a true 45° corner ribbon, and a CHILD OF THE
 * PORTRAIT so the portrait's own `overflow: hidden` clips it. Both ends
 * bleed off-edge, so there's no raw terminal, and it can never reach the
 * header at any card height. That's a structural constraint replacing
 * what used to be a magic number.
 *
 * The colour is pinned `--bcc-primary`, NOT `--bcc-accent`: the accent
 * becomes orange when the viewer picks the secondary accent, which would
 * put an orange ribbon on the orange project kind.
 *
 * Decorative — the claim CTA + wallet flow lives on the entity page.
 */
function UnclaimedRibbon() {
  return (
    <span
      aria-hidden
      className="bcc-mono pointer-events-none absolute select-none text-center"
      style={{
        top: 20,
        right: -42,
        width: 170,
        transform: "rotate(45deg)",
        background: "var(--bcc-primary)",
        color: "var(--bcc-night)",
        fontSize: 8.5,
        fontWeight: 700,
        letterSpacing: "0.22em",
        padding: "5px 0",
      }}
    >
      UNCLAIMED
    </span>
  );
}

/**
 * Nameplate — name, handle and the audience count, read as ONE identity
 * block (hence the 1px gap on the counts row, not a section break).
 *
 * The audience LABEL is overridden client-side to FOLLOW_COPY.noun. The
 * server still says "Followers" on entity cards and "Watchers" on member
 * cards for what is the same PeepSo graph, and shipping both words on
 * adjacent cards reads as two different features. `value` is still used
 * verbatim per §A2 — only the word is normalised. The real fix is the
 * server emitting one label; this stops the split until it does.
 *
 * Community cards land here too, via their `members` count — they have
 * no audience stat on the wire, and no trust axis to fill a grid with.
 *
 * `watching` is deliberately NOT shown beside it: that count lives on
 * MemberProfile, not on `Card`, so there is no value to render. A zero
 * would be a fabrication, not an empty state.
 */
function Nameplate({
  card,
  audienceStats,
}: {
  card: Card;
  audienceStats: CardStat[];
}) {
  // §3.1 + /members convention — handles containing `@` are PeepSo-default
  // email-shaped (no real handle picked yet). Rendering "@user@domain.com"
  // reads as broken UI, so the kicker is suppressed until they pick one.
  const showHandle = !card.handle.includes("@");

  // `watchers` is normalised to the floor's word (the server still says
  // "Followers" on entity cards for the same PeepSo graph). `members` and
  // `watching` keep their own labels — a community head-count isn't a
  // watcher count, and "Watching" is already the right word.
  const labelFor = (stat: CardStat): string =>
    stat.key === "followers" || stat.key === "watchers"
      ? FOLLOW_COPY.noun
      : stat.label;

  return (
    <div className="relative z-[1] flex shrink-0 flex-col items-center px-3 pb-1 pt-3 text-center">
      <h3
        className="bcc-stencil w-full truncate"
        style={{ fontSize: 17, lineHeight: 1.15, color: "var(--bcc-text)" }}
      >
        {card.name}
      </h3>

      {showHandle && (
        <p
          className="bcc-mono w-full truncate"
          style={{ fontSize: 10, color: "var(--bcc-text-muted)" }}
        >
          @{card.handle}
        </p>
      )}

      {audienceStats.length > 0 && (
        <p
          className="flex items-baseline justify-center gap-1.5"
          style={{ marginTop: 1, fontVariantNumeric: "tabular-nums" }}
        >
          {audienceStats.map((stat, i) => (
            <span key={stat.key} className="flex items-baseline gap-1.5">
              {/* Separator is a filled dot at ~60%, not a rule — the
                  counts have to keep reading as one identity block. */}
              {i > 0 && (
                <span
                  aria-hidden
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 9999,
                    alignSelf: "center",
                    opacity: 0.6,
                    background: "var(--bcc-text-muted)",
                  }}
                />
              )}
              <span
                className="bcc-stencil"
                style={{ fontSize: 12.5, color: "var(--bcc-text)" }}
              >
                {stat.value}
              </span>
              <span
                className="bcc-mono"
                style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "var(--bcc-text-muted)" }}
              >
                {labelFor(stat)}
              </span>
            </span>
          ))}
        </p>
      )}

      {/* §J.3.2 reliability standing — positive-only public badge,
          server-resolved. Absent means the entity hasn't earned one:
          render nothing (asymmetric-display rule — losing the badge is
          never a stigma marker). */}
      {card.reliability_standing != null && (
        <span className="mt-1">
          <ReliabilityStandingBadge standing={card.reliability_standing} />
        </span>
      )}
      {/* §21.4 (v1.62) — MENTOR chip. Emitted per-row by the server
          ONLY for actively listed mentors; strict === true so absent
          (every pre-Phase-7 backend, every non-mentor row) renders
          nothing. Positive-only signal, same posture as reliability. */}
      {card.is_mentor === true && (
        <span
          className="bcc-mono mt-1.5 inline-flex items-center rounded-sm px-1.5 py-[2px]"
          style={{
            fontSize: "9px",
            letterSpacing: "0.2em",
            color: "var(--verified)",
            background: "rgb(var(--verified-rgb) / 0.10)",
            border: "1px solid rgb(var(--verified-rgb) / 0.32)",
          }}
        >
          MENTOR
        </span>
      )}
    </div>
  );
}

/**
 * Column-count map for the stats grid. Cards shipping fewer than three
 * stats (community ships two: Members + Posts 7d; member cards ship
 * Trust + Reviews once the watcher count moves to the nameplate) would
 * otherwise render into a hard-coded 3-col grid and leave a dangling
 * empty column. Literal class strings so Tailwind's static extractor
 * sees them.
 */
const STATS_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

function StatsPanel({ stats }: { stats: CardStat[] }) {
  // The server may return more than three; we slice for layout and
  // never re-derive the values (§A2 — `value` is used verbatim).
  const visible = stats.slice(0, 3);
  if (visible.length === 0) return null;
  const cols = STATS_COLS[visible.length] ?? "grid-cols-3";

  return (
    <div
      className={`relative z-[1] grid shrink-0 ${cols} border-t px-4 py-2.5`}
      style={{ borderColor: "var(--bcc-glass-border)" }}
    >
      {visible.map((stat, i) => (
        <div
          key={stat.key}
          className="flex flex-col items-center text-center"
          style={{
            fontVariantNumeric: "tabular-nums",
            // Hairline gutters BETWEEN columns only.
            borderLeft: i > 0 ? "1px solid var(--bcc-glass-border)" : undefined,
          }}
        >
          <span
            className="bcc-mono"
            style={{ fontSize: 8.5, letterSpacing: "0.12em", color: "var(--bcc-text-muted)" }}
          >
            {stat.label}
          </span>
          <span
            className="bcc-stencil"
            style={{ fontSize: 20, lineHeight: 1.1, color: "var(--bcc-text)" }}
          >
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
