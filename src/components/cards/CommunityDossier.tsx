/**
 * CommunityDossier — back-of-card dossier for community cards.
 *
 * Mirrors MemberDossier's pattern (and reuses its exported
 * DossierSection / Row primitives) so member and community backs share
 * one visual vocabulary.
 *
 * Two registers, dispatched on `collection_stats`:
 *   - NFT holder groups → "COLLECTION" header + token-standard chip,
 *     dl rows over the server's `*_display` strings (§A2 — rendered
 *     verbatim, no client-side number formatting), a "Requires N NFT"
 *     footer, and an external marketplace link.
 *   - Locals / plain groups → "THE FLOOR" header with Members /
 *     Access / Chain rows. (The dossier carries no activity block on
 *     the wire today — the Activity row appears if the backend ever
 *     adds one.)
 *
 * Both registers pin a "YOU'RE A MEMBER HERE" line to the card bottom
 * when the viewer is a member.
 *
 * Pure render over the §L5 view-model (§A2) — every value comes
 * pre-resolved from the server.
 */

import type { MouseEvent } from "react";

import { DossierSection, Row } from "@/components/cards/MemberDossier";
import { COMMUNITY_CHAIN_CATALOG } from "@/lib/communities/chain-catalog";
import type { CardCommunityDossier } from "@/lib/api/types";

export function CommunityDossierBack({
  dossier,
}: {
  dossier: CardCommunityDossier;
}) {
  return (
    <>
      {dossier.collection_stats !== null ? (
        <CollectionBlock dossier={dossier} />
      ) : (
        <FloorBlock dossier={dossier} />
      )}

      {dossier.viewer_is_member && (
        <p className="bcc-mono mt-auto pt-3 text-center text-[10px] tracking-[0.2em] text-verified">
          YOU&rsquo;RE A MEMBER HERE
        </p>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NFT register — collection market data.
// ─────────────────────────────────────────────────────────────────────

function CollectionBlock({ dossier }: { dossier: CardCommunityDossier }) {
  const stats = dossier.collection_stats;
  if (stats === null) return null;

  const stop = (event: MouseEvent) => event.stopPropagation();

  // Row order is fixed; rows with a null display string are dropped
  // (the server emits "—" for present-but-empty, null for absent).
  const rows: Array<{ key: string; label: string; value: string }> = [];
  if (stats.floor_display !== null)
    rows.push({ key: "floor", label: "FLOOR", value: stats.floor_display });
  if (stats.volume_display !== null)
    rows.push({ key: "volume", label: "VOLUME", value: stats.volume_display });
  if (stats.holders_display !== null)
    rows.push({ key: "holders", label: "HOLDERS", value: stats.holders_display });
  if (stats.supply_display !== null)
    rows.push({ key: "supply", label: "SUPPLY", value: stats.supply_display });
  if (stats.listed_display !== null)
    rows.push({ key: "listed", label: "LISTED", value: stats.listed_display });
  if (stats.royalty_display !== null)
    rows.push({ key: "royalty", label: "ROYALTY", value: stats.royalty_display });

  return (
    <>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="bcc-mono text-[10px] tracking-[0.18em] text-blueprint">
          COLLECTION
        </p>
        {stats.token_standard !== null && (
          <span
            className="bcc-mono border border-cardstock-edge/40 px-1.5 py-[2px] text-ink-soft"
            style={{ fontSize: "9px", letterSpacing: "0.16em" }}
          >
            {stats.token_standard}
          </span>
        )}
      </div>

      <dl className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <Row key={row.key} label={row.label} value={row.value} />
        ))}
      </dl>

      <div className="mt-3 flex flex-col gap-1">
        {stats.min_balance_display !== null && (
          <p className="bcc-mono text-[10px] tracking-[0.16em] text-ink-soft">
            Requires {stats.min_balance_display}
          </p>
        )}
        {stats.marketplace !== null && (
          <a
            href={stats.marketplace.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            className="bcc-mono text-[10px] tracking-[0.16em] text-blueprint underline-offset-2 hover:underline"
          >
            View on {stats.marketplace.label} ↗
          </a>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Non-NFT register — locals and plain groups.
// ─────────────────────────────────────────────────────────────────────

/**
 * Access copy — same precedence as the front-face signals strip
 * (trust gate beats privacy; trust groups run on PeepSo "open"
 * privacy under the hood so trust_min is the canonical gate signal).
 */
function accessLabel(dossier: CardCommunityDossier): string {
  if (dossier.trust_min !== null) return `Trust ${dossier.trust_min}+`;
  if (dossier.privacy === "closed") return "Request to join";
  if (dossier.privacy === "secret") return "Invite-only";
  return "Open to all";
}

function FloorBlock({ dossier }: { dossier: CardCommunityDossier }) {
  const chainLabel =
    dossier.chain_tag !== null
      ? COMMUNITY_CHAIN_CATALOG.find((o) => o.slug === dossier.chain_tag)
          ?.label ?? dossier.chain_tag.toUpperCase()
      : null;

  return (
    <DossierSection label="THE FLOOR">
      <Row label="MEMBERS" value={dossier.member_count.toLocaleString()} />
      <Row label="ACCESS" value={accessLabel(dossier)} />
      {chainLabel !== null && <Row label="CHAIN" value={chainLabel} />}
    </DossierSection>
  );
}
