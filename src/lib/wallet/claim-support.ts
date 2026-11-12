/**
 * Which validator pages can be claimed, and why the rest can't.
 *
 * ⚠ Deliberately separate from `WALLET_CHAIN_CATALOG`, which is the
 * wallet-LINKING catalog. A chain can be linkable to an account and still
 * not be claimable as a validator: linking proves "you hold this key",
 * claiming proves "this key is this validator's operator". Only add a
 * chain here once `ClaimService::matchValidator()` can establish the second
 * from stored data.
 *
 * Plain module, not part of ClaimFlow, so the server-rendered landing page
 * and the validator page can read the same answer the flow acts on.
 */

import { findWalletChain, type WalletChainType } from "@/lib/wallet/chain-catalog";

/** Chain types whose validator operator authority the backend can PROVE. */
export const CLAIMABLE_CHAIN_TYPES: ReadonlySet<WalletChainType> = new Set<WalletChainType>([
  "cosmos",
  "polkadot",
]);

/**
 * Linkable Cosmos-SDK chains that still can't be claimed. THORChain's stored
 * `operator_address` is the NODE address, not `node_operator_address`, so the
 * bech32 byte compare has nothing an operator's wallet could match.
 */
const UNCLAIMABLE_SLUGS: ReadonlySet<string> = new Set(["thorchain"]);

export function isChainClaimable(slug: string): boolean {
  const chainType = findWalletChain(slug)?.chainType;
  return (
    chainType !== undefined &&
    CLAIMABLE_CHAIN_TYPES.has(chainType) &&
    !UNCLAIMABLE_SLUGS.has(slug)
  );
}

/** Why a chain cannot be claimed, in the operator's terms. */
export function unsupportedClaimReason(slug: string): string {
  if (findWalletChain(slug)?.chainType === "solana") {
    return (
      "Solana validator pages can't be claimed yet. Proving a Solana " +
      "validator needs the vote account's withdraw authority, which BCC " +
      "doesn't record — and the key we do record is the identity key that " +
      "lives on your validator host, which should never go in a browser " +
      "wallet."
    );
  }
  if (findWalletChain(slug)?.chainType === "evm") {
    return `${slug} doesn't have validator pages, so there's nothing to claim here.`;
  }
  return (
    `Claiming isn't available for ${slug} yet, because BCC can't prove ` +
    "operator authority on this chain from the data it stores."
  );
}
