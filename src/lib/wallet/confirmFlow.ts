/**
 * Account-change confirmation by wallet signature (F-253, contract v1.130).
 *
 * An account with NO password (`recovery.has_password === false`) confirms
 * an email change, a password set/change or deleting the account by
 * signing a purpose-bound challenge with one of its own verified,
 * established wallets. Connect → GET /auth/nonce?purpose=… for that wallet
 * and chain → sign `message` exactly as returned → the four wallet fields
 * the endpoint takes instead of `current_password`.
 *
 * Reuses the wallet-link primitives (lib/wallet/dispatch, linkFlow) — the
 * only differences are the nonce's `purpose` and that the signer must be
 * the wallet the member picked, not whichever is active.
 */

import type { WalletCredential } from "@/lib/api/account-endpoints";
import { getWalletNonce } from "@/lib/api/auth-endpoints";
import type { LinkedWallet } from "@/lib/api/types";
import type { WalletChainType } from "@/lib/wallet/chain-catalog";
import { connectWallet, signWalletChallenge, walletTypeFor } from "@/lib/wallet/dispatch";
import { sameAddress } from "@/lib/wallet/linkFlow";

export type ConfirmPurpose =
  | "confirm_email_change"
  | "confirm_password_change"
  | "confirm_account_delete";

const CHAIN_TYPES: ReadonlySet<string> = new Set(["evm", "cosmos", "solana", "polkadot"]);

/** Thrown when the wallet extension is on a different account than the one picked. */
export class WrongWalletError extends Error {
  constructor(public readonly expected: string) {
    super("wrong_wallet");
    this.name = "WrongWalletError";
  }
}

/** Thrown for a linked wallet whose chain this app cannot sign for. */
export class UnsupportedConfirmWalletError extends Error {
  constructor() {
    super("unsupported_wallet");
    this.name = "UnsupportedConfirmWalletError";
  }
}

export async function signAccountConfirmation(
  purpose: ConfirmPurpose,
  wallet: Pick<LinkedWallet, "wallet_address" | "chain_slug" | "chain_type">,
): Promise<WalletCredential> {
  if (!CHAIN_TYPES.has(wallet.chain_type)) throw new UnsupportedConfirmWalletError();
  const chainType = wallet.chain_type as WalletChainType;

  const connection = await connectWallet(wallet.chain_slug, chainType);
  // Polkadot exposes several accounts: use the picked one if present.
  const candidates = [connection.address, ...(connection.accounts?.map((a) => a.address) ?? [])];
  const kind = walletTypeFor(chainType);
  const address = candidates.find((a) => sameAddress(kind, a, wallet.wallet_address));
  if (address === undefined) throw new WrongWalletError(wallet.wallet_address);

  const nonce = await getWalletNonce({
    chain_slug: wallet.chain_slug,
    wallet_address: address,
    purpose,
  });
  const signed = await signWalletChallenge(
    wallet.chain_slug,
    chainType,
    { ...connection, address },
    nonce.message,
  );
  return {
    wallet_address: address,
    chain_slug: wallet.chain_slug,
    signature: signed.signature,
    ...(Object.keys(signed.extra).length > 0 ? { extra: signed.extra } : {}),
  };
}
