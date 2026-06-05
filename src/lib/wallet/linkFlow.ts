/**
 * Wallet-link flow — the connect → request nonce → sign → bundle sequence
 * that the `POST /auth/wallet-link` call needs, plus the error humanizer for
 * the link path.
 *
 * Lifted out of `components/settings/WalletsSection.tsx` so both the Settings
 * link form AND the inline "connect & verify" flow on the holder-group detail
 * page share ONE implementation (§11 — no parallel copies). The three provider
 * branches are dispatched inside `lib/wallet/dispatch.ts` so this layer stays
 * one straight-line flow.
 */

import { getWalletNonce } from "@/lib/api/auth-endpoints";
import { humanizeCode } from "@/lib/api/errors";
import type { WalletChainType } from "@/lib/wallet/chain-catalog";
import {
  connectWallet,
  humanizeWalletProviderError,
  signWalletChallenge,
  walletTypeFor,
} from "@/lib/wallet/dispatch";

export interface LinkFlowResult {
  address: string;
  signature: string;
  walletType: string;
  extra: Record<string, string>;
}

export async function runLinkFlow(
  chainSlug: string,
  chainType: WalletChainType,
): Promise<LinkFlowResult> {
  const connection = await connectWallet(chainSlug, chainType);

  const nonce = await getWalletNonce({
    chain_slug:     chainSlug,
    wallet_address: connection.address,
  });

  const signed = await signWalletChallenge(
    chainSlug,
    chainType,
    connection,
    nonce.message,
  );

  return {
    address:    connection.address,
    signature:  signed.signature,
    walletType: walletTypeFor(chainType),
    extra:      signed.extra,
  };
}

export function humanizeLinkError(err: unknown): string {
  // Provider-side errors (Keplr / MetaMask / Phantom unavailable, user
  // cancel, etc.) come back as typed objects; dispatch.ts owns the
  // copy. Returns null for non-provider errors → fall through to
  // server-side BccApiError mapping (`humanizeCode` branches on
  // `.code`, never `.message`).
  const provider = humanizeWalletProviderError(err);
  if (provider !== null) return provider;

  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in required.",
      bcc_rate_limited: "Too many wallet attempts. Wait a moment and retry.",
      bcc_signature_invalid: "Wallet signature didn't verify. Try again.",
      bcc_conflict: "This wallet is already linked.",
      bcc_invalid_request: "Couldn't link the wallet. Check the chain selection.",
      bcc_wallet_not_supported: "That wallet chain isn't supported yet.",
    },
    "Couldn't link the wallet.",
  );
}
