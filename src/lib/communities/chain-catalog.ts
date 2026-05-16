/**
 * Static chain catalog for the /communities chain filter.
 *
 * Mirrors the set of chains that NFT-holder community groups
 * currently bind to via `_bcc_gate_chain_id` post_meta. Same
 * vocabulary as `lib/validators/chain-catalog.ts` (the directory's
 * CHAIN dropdown) — keeps the two filter surfaces consistent.
 *
 * Today the live data set is Stargaze + Solana (the two chains the
 * NFT indexer has seeded gated groups on). The other entries are
 * forward-looking: when an admin grants holder-gating for a chain
 * the system already indexes (Ethereum, Polygon, Base, etc.), the
 * filter is one row-edit away from working. Selecting a chain with
 * zero matching groups yields an empty result — never an error.
 *
 * Why static (same reasoning as wallet/chain-catalog + validators/
 * chain-catalog): chain config moves at the speed of an indexer
 * deploy, not a request. A live /chains fetch would add a
 * round-trip per page render for ~quarterly-changing data.
 */

export interface CommunityChainOption {
  /** `bcc_onchain_chains.slug` — the value sent to `/bcc/v1/groups`. */
  slug: string;
  /** Display label rendered in the dropdown + active-filter chip. */
  label: string;
}

export const COMMUNITY_CHAIN_CATALOG: ReadonlyArray<CommunityChainOption> = [
  // Cosmos chains with NFT holder groups (Stargaze live; the rest
  // pre-wired for V1.5 admin-approved gating).
  { slug: "stargaze",  label: "Stargaze" },
  { slug: "cosmos",    label: "Cosmos Hub" },
  { slug: "osmosis",   label: "Osmosis" },
  { slug: "injective", label: "Injective" },

  // Non-Cosmos chains.
  { slug: "solana",   label: "Solana" },
  { slug: "ethereum", label: "Ethereum" },
  { slug: "polygon",  label: "Polygon" },
  { slug: "base",     label: "Base" },
];
