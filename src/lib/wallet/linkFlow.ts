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

import { getWalletNonce, linkWallet } from "@/lib/api/auth-endpoints";
import { humanizeCode } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";
import { getMyWallets } from "@/lib/api/wallets-endpoints";
import type { WalletChainType } from "@/lib/wallet/chain-catalog";
import {
  connectWallet,
  humanizeWalletProviderError,
  signWalletChallenge,
  walletTypeFor,
  type WalletConnection,
} from "@/lib/wallet/dispatch";

export interface LinkFlowResult {
  address: string;
  signature: string;
  walletType: string;
  extra: Record<string, string>;
}

/** Connect, then sign — the whole sequence in one call. */
export async function runLinkFlow(
  chainSlug: string,
  chainType: WalletChainType,
): Promise<LinkFlowResult> {
  const connection = await connectWallet(chainSlug, chainType);
  return signLinkChallenge(chainSlug, chainType, connection);
}

/**
 * The second half of {@link runLinkFlow}, for callers that connect as a
 * separate step (the validator ClaimFlow shows Connect and Sign as two
 * screens on purpose): request a nonce for the connected address, sign
 * it, and return the bundle `POST /auth/wallet-link` needs, including
 * the chain-specific `extra` (Cosmos: `{pub_key, chain_id}`).
 */
export async function signLinkChallenge(
  chainSlug: string,
  chainType: WalletChainType,
  connection: WalletConnection,
): Promise<LinkFlowResult> {
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

/**
 * Link a signed wallet, treating "already linked to YOUR account" as
 * success. Returns "linked" or "already_linked".
 *
 * The backend answers both "already linked to your account" and "already
 * linked to another account" with the same `bcc_conflict` code; only the
 * message differs, and §γ forbids branching on messages. So on a conflict
 * this checks the viewer's own wallet list: if this chain + address is
 * there, the link already exists (a re-run, or a retry after the link
 * succeeded but a later step failed). Otherwise the conflict is rethrown.
 */
export async function linkOrConfirmOwnWallet(
  chainSlug: string,
  linked: LinkFlowResult,
): Promise<"linked" | "already_linked"> {
  try {
    await linkWallet({
      wallet_address: linked.address,
      signature:      linked.signature,
      wallet_type:    linked.walletType,
      extra:          linked.extra,
    });
    return "linked";
  } catch (err) {
    if (!(err instanceof BccApiError) || err.code !== "bcc_conflict") throw err;
    const mine = await getMyWallets();
    const own = mine.items.find(
      (w) => w.chain_slug === chainSlug && sameAddress(linked.walletType, w.wallet_address, linked.address),
    );
    if (own === undefined) throw err;
    if (!own.verified) {
      // On this account, but never verified: claiming would fail on the
      // page step with misleading copy, so stop here with its own code.
      throw new BccApiError(
        "bcc_wallet_unverified",
        "This wallet is on your account but isn't verified.",
        409,
        null,
      );
    }
    return "already_linked";
  }
}

/**
 * Address equality per wallet family. bech32 (Keplr) and 0x-hex
 * (MetaMask) are case-insensitive, so they compare lowercased. base58
 * (Phantom) and SS58 (Polkadot) are case-SENSITIVE: lowercasing would
 * make two different addresses match, so they compare exactly.
 */
function sameAddress(walletType: string, a: string, b: string): boolean {
  return walletType === "keplr" || walletType === "metamask"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
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
    },
    "Couldn't link the wallet.",
  );
}
