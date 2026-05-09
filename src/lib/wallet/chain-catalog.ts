/**
 * Static chain catalog for the wallet-link UI.
 *
 * Mirrors the active rows in `wp_bcc_chains` for the chains the
 * frontend has signing flows for today (EVM, Cosmos, Solana). The
 * backend `WalletVerifier::SLUG_TO_TYPE` map is the source of truth
 * for which chain types verify; this catalog is the source of truth
 * for which slugs the picker UI surfaces.
 *
 * NEAR / Polkadot / THORChain rows exist in `wp_bcc_chains` but have
 * no signing-flow adapter yet — they're intentionally absent from
 * this catalog. Adding them later means: write the adapter, add the
 * `chainType` enum entry, append the row here, branch in
 * WalletsSection's link function. Backend already verifies whatever
 * `WalletVerifier::verify` dispatches on.
 *
 * Why static: chain config moves at the speed of a code release, not
 * a request. A dynamic /chains fetch would add a round-trip to every
 * settings-page render for data that changes ~quarterly.
 */

export type WalletChainType = "evm" | "cosmos" | "solana";

export interface WalletChainOption {
  /** wp_bcc_chains.slug — the value sent to /auth/wallet-nonce. */
  slug: string;
  /** Display label rendered in the dropdown. */
  label: string;
  /** Dispatch tag — picks the signing flow + the wallet_type label. */
  chainType: WalletChainType;
  /**
   * EIP-155 chain id in 0x-hex form (only EVM). Used to politely ask
   * MetaMask to switch chains before signing. Optional because the
   * backend doesn't require it — signature verification is chain-
   * agnostic on the EVM side (recover address, compare).
   */
  chainIdHex?: string;
}

export const WALLET_CHAIN_CATALOG: ReadonlyArray<WalletChainOption> = [
  // EVM — order matches the most-likely-to-be-picked first.
  { slug: "ethereum",  label: "Ethereum",          chainType: "evm", chainIdHex: "0x1"    },
  { slug: "polygon",   label: "Polygon",           chainType: "evm", chainIdHex: "0x89"   },
  { slug: "base",      label: "Base",              chainType: "evm", chainIdHex: "0x2105" },
  { slug: "arbitrum",  label: "Arbitrum One",      chainType: "evm", chainIdHex: "0xa4b1" },
  { slug: "optimism",  label: "Optimism",          chainType: "evm", chainIdHex: "0xa"    },
  { slug: "avalanche", label: "Avalanche C-Chain", chainType: "evm", chainIdHex: "0xa86a" },
  { slug: "bsc",       label: "BNB Smart Chain",   chainType: "evm", chainIdHex: "0x38"   },

  // Solana — single chain.
  { slug: "solana",    label: "Solana",            chainType: "solana" },

  // Cosmos — order matches keplr.ts COSMOS_CHAIN_IDS plus the staked-on bcc-trust set.
  // THORChain is a Cosmos-SDK chain (secp256k1 + bech32 'thor' HRP);
  // the backend's CosmosSignatureVerifier handles it via ADR-036 the
  // same way as cosmos / osmosis (HRP derived from address, no
  // hardcoded prefix).
  { slug: "cosmos",    label: "Cosmos Hub",        chainType: "cosmos" },
  { slug: "osmosis",   label: "Osmosis",           chainType: "cosmos" },
  { slug: "injective", label: "Injective",         chainType: "cosmos" },
  { slug: "juno",      label: "Juno",              chainType: "cosmos" },
  { slug: "stargaze",  label: "Stargaze",          chainType: "cosmos" },
  { slug: "thorchain", label: "THORChain",         chainType: "cosmos" },
];

/**
 * Group the catalog by chainType for the dropdown's <optgroup>s.
 * Order is deterministic: EVM first, Solana, Cosmos last (matches
 * the catalog above; just promotes the type-grouping of the same set).
 */
export function groupedWalletChains(): ReadonlyArray<{
  chainType: WalletChainType;
  label: string;
  options: WalletChainOption[];
}> {
  return [
    {
      chainType: "evm",
      label: "EVM (MetaMask)",
      options: WALLET_CHAIN_CATALOG.filter((c) => c.chainType === "evm"),
    },
    {
      chainType: "solana",
      label: "Solana (Phantom)",
      options: WALLET_CHAIN_CATALOG.filter((c) => c.chainType === "solana"),
    },
    {
      chainType: "cosmos",
      label: "Cosmos (Keplr)",
      options: WALLET_CHAIN_CATALOG.filter((c) => c.chainType === "cosmos"),
    },
  ];
}

/**
 * Resolve a slug to its catalog entry. Returns `undefined` for
 * unknown slugs so callers can branch (likely show a friendly error
 * — there's no signing flow for chains not in this catalog).
 */
export function findWalletChain(slug: string): WalletChainOption | undefined {
  return WALLET_CHAIN_CATALOG.find((c) => c.slug === slug);
}
