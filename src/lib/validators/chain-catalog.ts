/**
 * Static chain catalog for the validator directory filter.
 *
 * Mirrors the set of chains the BCC validator indexer currently
 * populates (see ChainRefreshService::index_validators + the
 * Cosmos/Solana/Polkadot/NEAR/THORChain fetchers). Each entry is a
 * slug + display label; the slug travels in the URL as `?chain=<slug>`
 * and on the wire to `/wp-json/bcc/v1/cards?chain=<slug>`, where the
 * backend validates against the live `bcc_onchain_chains` table.
 *
 * Why static here rather than dynamic via `/bcc/v1/chains`:
 *   - That endpoint returns ALL active chains including EVM ones
 *     (Ethereum, Polygon, Base) which have no validator data — we
 *     don't want them in the validator pill.
 *   - The validator chain set moves at the speed of an indexer
 *     deploy, not a request. A round-trip per page render for static
 *     data would be wasted work.
 *
 * Same vocabulary + reasoning as `lib/wallet/chain-catalog.ts` (the
 * wallet-link picker's static catalog). If/when a new chain ships
 * via the indexer, append a row here.
 *
 * Order: Cosmos chains first (most validator volume + the original
 * V2-Phase-2 launch set), then the non-Cosmos rollouts. Within each
 * group, alphabetical for predictable scan.
 */

export interface ValidatorChainOption {
  /** `bcc_onchain_chains.slug` — the value sent to `/bcc/v1/cards`. */
  slug: string;
  /** Display label rendered in the dropdown + active-filter chip. */
  label: string;
}

export const VALIDATOR_CHAIN_CATALOG: ReadonlyArray<ValidatorChainOption> = [
  // Cosmos chains — the V2-Phase-2 launch set.
  { slug: "akash",          label: "Akash" },
  { slug: "cosmos",         label: "Cosmos Hub" },
  { slug: "cryptoorgchain", label: "Cronos POS" },
  { slug: "dungeon",        label: "Dungeon Chain" },
  { slug: "injective",      label: "Injective" },
  { slug: "jackal",         label: "Jackal" },
  { slug: "juno",           label: "Juno" },
  { slug: "kujira",         label: "Kujira" },
  { slug: "osmosis",        label: "Osmosis" },
  { slug: "stargaze",       label: "Stargaze" },
  { slug: "thorchain",      label: "THORChain" },

  // Non-Cosmos chains the indexer also covers.
  { slug: "near",     label: "NEAR Protocol" },
  { slug: "polkadot", label: "Polkadot" },
  { slug: "solana",   label: "Solana" },
];
