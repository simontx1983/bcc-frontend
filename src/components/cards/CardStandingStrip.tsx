/**
 * CardStandingStrip — the card's bottom row: at most one resolved
 * standing row, plus the flip chip.
 *
 * This replaces the old identity strip entirely. With RankChip moved
 * into the header row, every element of that strip had become a
 * duplicate of something already on the card.
 *
 * FIVE TIERS, FIRST MATCH WINS:
 *
 *   T1 Alarm    Something is wrong with this page
 *   T2 Barrier  Something stands between you and this page
 *   T3 Network  Who you already know here (per-viewer)
 *   T4 Identity What this thing is — the resting state
 *   T5 Empty    Nothing true to say → row omitted, portrait grows
 *
 * The client picks the first non-empty row and never derives values.
 * An absent wire block means SKIP THAT ROW — never a placeholder and
 * never invented text.
 *
 * Deliberate omissions, all load-bearing:
 *   - "Unclaimed" is NOT on the ladder. The corner ribbon already says
 *     it in the loudest position on the card; repeating it 380px lower
 *     is exactly the duplication this restructure removes. An unclaimed
 *     entity drops straight to T3, which is more useful anyway.
 *   - "You vouched" is absent — the Vouch pill reports that by filling.
 *   - Member has no T2: nothing gates a person.
 *   - Within T3, vouched-by beats watched-by. One, never both.
 *
 * T3 is wired but currently DARK: `social_proof` is null on every kind
 * server-side (three explicit STUB comments in CardViewService). The
 * ladder simply skips it until the field composes, and nothing looks
 * broken in the meantime.
 */

import type { Card } from "@/lib/api/types";
import { FlipIcon } from "@/components/icons/registry";

type StandingTone = "alarm" | "barrier" | "identity";

interface StandingRow {
  tone: StandingTone;
  text: string;
  /** Omitted on alarm (the whole row is the signal) and on network rows. */
  dotColor?: string;
}

/** T1 — anything actively wrong. Server-resolved flags + negative signals. */
function resolveAlarm(card: Card): StandingRow | null {
  const flags = card.flags;
  const negative = card.negative_signals;

  if (flags.includes("suspended")) {
    return { tone: "alarm", text: "Suspended" };
  }
  // A jailed validator is live financial risk. The on-chain strip does
  // state it, but in 9px grey as a fact among facts — this announces it.
  if (card.onchain_signals?.status === "jailed") {
    return { tone: "alarm", text: "Jailed on-chain" };
  }
  if (negative?.under_review === true || flags.includes("under_review")) {
    return { tone: "alarm", text: "Under review" };
  }
  if (flags.includes("shadow_limited")) {
    return { tone: "alarm", text: "Limited" };
  }
  if (flags.includes("hidden")) {
    return { tone: "alarm", text: "Hidden" };
  }
  // "claim" already means claiming an unclaimed page in this product, so
  // unresolved_claims_count must NEVER render as the word "claim".
  if (negative !== undefined && negative.unresolved_claims_count > 0) {
    const n = negative.unresolved_claims_count;
    return { tone: "alarm", text: `${n} open ${n === 1 ? "dispute" : "disputes"}` };
  }
  return null;
}

/**
 * T2 — communities only. Nothing gates a person, and the ribbon owns
 * unclaimed.
 *
 * Privacy and the trust threshold are NOT here: they're the `access`
 * stat in the grid now, and saying "Private" in a stat cell and again in
 * the strip is the same duplication that got the old signals strip
 * deleted. What survives is the holding requirement, because it's the
 * one gate the access word can't express — "Public" and "Requires 1 NFT"
 * are both true of a holder group at the same time.
 */
function resolveBarrier(card: Card): StandingRow | null {
  const dossier = card.community_dossier;
  if (dossier === null) return null;
  if (dossier.viewer_is_member) return null;

  const requirement = dossier.collection_stats?.min_balance_display ?? null;
  if (requirement !== null && requirement !== "") {
    return {
      tone: "barrier",
      text: `Requires ${requirement}`,
      dotColor: "var(--bcc-safety)",
    };
  }
  return null;
}

/**
 * T3 — per-viewer network proof, and the only row that says something the
 * rest of the card physically cannot. Dark until `social_proof` composes.
 */
function resolveNetwork(card: Card): StandingRow | null {
  const proof = card.social_proof;
  if (proof === null) return null;

  if (proof.vouched_by_in_network > 0) {
    const n = proof.vouched_by_in_network;
    return { tone: "identity", text: `Vouched by ${n} you know` };
  }
  if (card.card_kind === "community" && (proof.held_by_in_network ?? 0) > 0) {
    return { tone: "identity", text: `Held by ${proof.held_by_in_network} you know` };
  }
  if (proof.followed_by_in_network > 0) {
    const n = proof.followed_by_in_network;
    return { tone: "identity", text: `Watched by ${n} you watch` };
  }
  return null;
}

/**
 * Verification statements get the canonical verified green; plain
 * identity statements (primary hall, group kicker) get the kind colour.
 * The old signals strip drew this dot in `--blueprint` deep navy, which
 * was effectively invisible on a dark card.
 */
const VERIFIED_DOT = "var(--bcc-verified)";

/** T4 — the resting state: what this thing actually is. */
function resolveIdentity(card: Card, kindColor: string): StandingRow | null {
  if (card.card_kind === "member") {
    const hall = card.member_dossier?.primary_hall;
    return hall != null
      ? { tone: "identity", text: hall.name, dotColor: kindColor }
      : null;
  }

  if (card.card_kind === "community") {
    const dossier = card.community_dossier;
    if (dossier === null) return null;
    // Community always resolves something here — the kicker is always
    // present and privacy is always a real value — so a community card
    // can never reach T5. Guaranteed content, zero backend work.
    if (dossier.verification !== null) {
      return { tone: "identity", text: dossier.verification.label, dotColor: VERIFIED_DOT };
    }
    // Privacy moved to the `access` stat, so this row is now purely
    // "what kind of room is this" — "Chain Hall", "Holder community".
    const kicker = card.kicker ?? "";
    return kicker !== ""
      ? { tone: "identity", text: kicker, dotColor: kindColor }
      : null;
  }

  // Projects have no on-chain backing and can never be unclaimed, so
  // "Claimed & verified" is the wrong sentence for them — their T4 is
  // meant to be GitHub verification. `Card` carries no github field
  // today (only MemberDossier does, and that describes a PERSON), so
  // this row correctly stays empty until the backend ships one.
  if (card.card_kind === "project") {
    return null;
  }

  if (card.is_claimed) {
    return { tone: "identity", text: "Claimed & verified", dotColor: VERIFIED_DOT };
  }
  return null;
}

export function CardStandingStrip({
  card,
  kindColor,
  flipped,
  onFlip,
}: {
  card: Card;
  /** The card's --kind-* colour, used as the T4 identity dot. */
  kindColor: string;
  flipped: boolean;
  onFlip: () => void;
}) {
  const row =
    resolveAlarm(card) ??
    resolveBarrier(card) ??
    resolveNetwork(card) ??
    resolveIdentity(card, kindColor);

  return (
    <div className="bcc-card-standing">
      {row !== null && (
        <span className="bcc-card-standing-row" data-tone={row.tone}>
          {row.dotColor !== undefined && (
            <span
              aria-hidden
              className="bcc-card-standing-dot"
              style={{ background: row.dotColor }}
            />
          )}
          <span className="bcc-card-standing-text">{row.text}</span>
        </span>
      )}

      <button
        type="button"
        className="bcc-card-flip-chip"
        aria-pressed={flipped}
        aria-label={flipped ? `Show the front of ${card.name}'s card` : `Show the back of ${card.name}'s card`}
        onClick={(e) => {
          // The card body is a link — flipping must never navigate it.
          e.preventDefault();
          e.stopPropagation();
          onFlip();
        }}
      >
        <FlipIcon size={11} strokeWidth={2} aria-hidden />
        {flipped ? "Front" : "Flip"}
      </button>
    </div>
  );
}
