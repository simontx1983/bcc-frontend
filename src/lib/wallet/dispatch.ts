"use client";

/**
 * Unified wallet dispatch — single source of truth for "given a chain
 * type, connect + sign with the matching provider."
 *
 * Replaces two parallel copies of the same chainType → provider switch
 * (one in WalletsSection's runLinkFlow, one inline in WalletAuthButton).
 *
 * Wraps lib/wallet/{keplr,metamask,phantom}.ts. The chain-specific
 * adapters stay as is; this layer just picks one based on chainType
 * and packs the result into a uniform shape.
 *
 *   {chainType: 'evm'    → metamask.ts}
 *   {chainType: 'solana' → phantom.ts}
 *   {chainType: 'cosmos' → keplr.ts}
 *
 * The `extra` payload returned from `signWalletChallenge` is always a
 * `Record<string, string>` — for Cosmos it carries `{pub_key, chain_id}`
 * which the backend's CosmosSignatureVerifier reads; for EVM and Solana
 * it is `{}` because the signature self-discloses the signer pubkey.
 *
 * No external deps. The provider adapters do all the wallet I/O; this
 * file only chooses between them.
 */

import {
  connectKeplr,
  KeplrError,
  KeplrUnavailableError,
  KeplrUnsupportedChainError,
  KeplrUserRejectedError,
  signKeplrChallenge,
} from "@/lib/wallet/keplr";
import {
  connectMetaMask,
  MetaMaskError,
  MetaMaskUnavailableError,
  MetaMaskUserRejectedError,
  MetaMaskWrongChainError,
  signMetaMaskChallenge,
} from "@/lib/wallet/metamask";
import {
  connectPhantom,
  PhantomError,
  PhantomUnavailableError,
  PhantomUserRejectedError,
  signPhantomChallenge,
} from "@/lib/wallet/phantom";
import {
  connectPolkadot,
  PolkadotError,
  PolkadotNoAccountsError,
  PolkadotUnavailableError,
  PolkadotUserRejectedError,
  signPolkadotChallenge,
} from "@/lib/wallet/polkadot";

import { findWalletChain, type WalletChainType } from "./chain-catalog";

// ─────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────

export interface WalletConnection {
  /** Signer address — bech32 (cosmos), 0x-hex (evm), base58 (solana), SS58 (polkadot). */
  address: string;
  /**
   * Cosmos: on-chain chain_id (e.g. "cosmoshub-4"). Used by the cosmos
   * signature extra payload. Empty string for EVM + Solana + Polkadot.
   */
  chainId: string;
  /**
   * Polkadot: provider key from `window.injectedWeb3` ("polkadot-js" /
   * "talisman" / etc.). Required so the matching sign call resolves to
   * the same wallet that returned the address. Empty string for other
   * chains.
   */
  source: string;
}

export interface WalletSignature {
  /** Provider signature in whatever encoding the backend verifier wants. */
  signature: string;
  /**
   * Verifier-specific extra payload. Cosmos: `{pub_key, chain_id}`.
   * EVM + Solana: `{}` — signature alone is enough.
   */
  extra: Record<string, string>;
}

/**
 * Connect to (or re-use) the provider that handles `chainType` and
 * return the active signer address.
 */
export async function connectWallet(
  chainSlug: string,
  chainType: WalletChainType,
): Promise<WalletConnection> {
  switch (chainType) {
    case "evm": {
      const desiredHex = findWalletChain(chainSlug)?.chainIdHex ?? "";
      const c = await connectMetaMask(desiredHex);
      return { address: c.address, chainId: "", source: "" };
    }
    case "solana": {
      const c = await connectPhantom();
      return { address: c.address, chainId: "", source: "" };
    }
    case "cosmos": {
      const c = await connectKeplr(chainSlug);
      return { address: c.address, chainId: c.chainId, source: "" };
    }
    case "polkadot": {
      const c = await connectPolkadot();
      return { address: c.address, chainId: "", source: c.source };
    }
  }
}

/**
 * Sign a UTF-8 challenge message with the wallet matching `chainType`
 * and return the bundle the BCC server's `WalletVerifier` accepts.
 *
 * Caller is responsible for calling `connectWallet` first.
 */
export async function signWalletChallenge(
  chainSlug: string,
  chainType: WalletChainType,
  connection: WalletConnection,
  message: string,
): Promise<WalletSignature> {
  switch (chainType) {
    case "evm": {
      const signed = await signMetaMaskChallenge(connection.address, message);
      return { signature: signed.signature, extra: {} };
    }
    case "solana": {
      const signed = await signPhantomChallenge(message);
      return { signature: signed.signature, extra: {} };
    }
    case "cosmos": {
      const signed = await signKeplrChallenge(
        chainSlug,
        connection.address,
        message,
      );
      return {
        signature: signed.signature,
        extra: { pub_key: signed.pubKey, chain_id: connection.chainId },
      };
    }
    case "polkadot": {
      const signed = await signPolkadotChallenge(
        connection.source,
        connection.address,
        message,
      );
      return { signature: signed.signature, extra: {} };
    }
  }
}

/** wallet_type label sent to /auth/wallet-link + /auth/wallet-signup. */
export function walletTypeFor(chainType: WalletChainType): "metamask" | "phantom" | "keplr" | "polkadot" {
  switch (chainType) {
    case "evm":      return "metamask";
    case "solana":   return "phantom";
    case "cosmos":   return "keplr";
    case "polkadot": return "polkadot";
  }
}

/** Small UPPERCASE hint copy: "SIGNS WITH METAMASK", etc. */
export function walletHintFor(chainType: WalletChainType): string {
  switch (chainType) {
    case "evm":      return "SIGNS WITH METAMASK (OR ANY EIP-1193 EVM WALLET)";
    case "solana":   return "SIGNS WITH PHANTOM (OR ANOTHER SOLANA WALLET)";
    case "cosmos":   return "SIGNS WITH KEPLR";
    case "polkadot": return "SIGNS WITH POLKADOT.JS / TALISMAN / SUBWALLET / NOVA";
  }
}

/**
 * Map a known provider error to user-facing copy. Returns `null` when
 * the error is NOT a provider-side error — the caller should then fall
 * through to its own server-side error mapping (e.g. humanizeCode).
 *
 * Keeps the three provider error families behind one switch so consumers
 * don't have to enumerate `instanceof X || instanceof Y || ...` themselves.
 */
export function humanizeWalletProviderError(err: unknown): string | null {
  // Unavailable provider — each adapter authors its own copy (different
  // wallets, different install URLs); pass through verbatim.
  if (
    err instanceof KeplrUnavailableError ||
    err instanceof MetaMaskUnavailableError ||
    err instanceof PhantomUnavailableError ||
    err instanceof PolkadotUnavailableError
  ) {
    return err.message;
  }
  // User-cancel is identical UX across providers.
  if (
    err instanceof KeplrUserRejectedError ||
    err instanceof MetaMaskUserRejectedError ||
    err instanceof PhantomUserRejectedError ||
    err instanceof PolkadotUserRejectedError
  ) {
    return "Wallet signing was canceled.";
  }
  // EVM-only chain-switch failure — wallet refused or hadn't pre-added
  // the chain. The wallet message already explains "switch it manually
  // and try again", so pass through.
  if (err instanceof MetaMaskWrongChainError) {
    return err.message;
  }
  if (err instanceof KeplrUnsupportedChainError) {
    return err.message;
  }
  // Polkadot-specific: no accounts in the wallet. Distinct from
  // unavailable (provider present but empty) — the adapter authors
  // copy explaining "create or import an account".
  if (err instanceof PolkadotNoAccountsError) {
    return err.message;
  }
  // Other typed wallet errors (constructed by adapters with deliberate
  // copy) — pass the message through.
  if (
    err instanceof KeplrError ||
    err instanceof MetaMaskError ||
    err instanceof PhantomError ||
    err instanceof PolkadotError
  ) {
    return err.message;
  }
  return null;
}
