"use client";

/**
 * MetaMask / EIP-1193 wallet helper — the EVM counterpart to keplr.ts.
 *
 * Covers the link flow for every EVM chain BCC indexes (Ethereum,
 * Polygon, Arbitrum, Optimism, Base, Avalanche, BSC). Uses the standard
 * EIP-1193 `window.ethereum` provider so it works with MetaMask,
 * Coinbase Wallet, Rabby, and other EVM-compatible browser extensions
 * that inject the same surface.
 *
 * Signing uses `personal_sign` which is what Ethereum's
 * `EthSignatureVerifier::recoverAddress` expects: 130-hex-char
 * compact (r||s||v) signature with optional 0x prefix. The verifier
 * normalises v across the 0/1 and 27/28 forms — we just pass through
 * whatever the wallet returns.
 *
 * No external deps. The whole file uses only the EIP-1193 provider
 * surface and primitive string ops; the backend does all the
 * cryptography (no client-side ecrecover, no bundle bloat).
 *
 * Per §N1: "MetaMask" appears in the user-facing tooltip; the API
 * surface stays neutral so we can swap in WalletConnect later without
 * renaming.
 */

// ─────────────────────────────────────────────────────────────────────
// EIP-1193 provider type — the slice of window.ethereum we actually use.
// ─────────────────────────────────────────────────────────────────────

interface EvmProviderRequestArgs {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

interface EvmProvider {
  request<T = unknown>(args: EvmProviderRequestArgs): Promise<T>;
}

declare global {
  interface Window {
    ethereum?: EvmProvider;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Errors — typed family parallels keplr.ts so the UI can render
// specific copy via instanceof checks.
// ─────────────────────────────────────────────────────────────────────

import { MOBILE_WALLET_HINT, WALLET_FAILED_COPY, walletRejectedCopy, type WalletStage } from "@/lib/wallet/error-copy";

export class MetaMaskError extends Error {
  override readonly name: string = "MetaMaskError";
}

export class MetaMaskUnavailableError extends MetaMaskError {
  override readonly name = "MetaMaskUnavailableError";
  /** Where to get the wallet (rendered as a link by the claim flow). */
  readonly installUrl = "https://metamask.io/download/";
  constructor() {
    super(`MetaMask (or another EVM wallet) isn't installed in this browser. Install one to continue. ${MOBILE_WALLET_HINT}`);
  }
}

export class MetaMaskUserRejectedError extends MetaMaskError {
  override readonly name = "MetaMaskUserRejectedError";
  /** Declined at the connect prompt, or cancelled at signing. */
  readonly stage: WalletStage;
  constructor(stage: WalletStage = "sign") {
    super(walletRejectedCopy(stage));
    this.stage = stage;
  }
}

export class MetaMaskWrongChainError extends MetaMaskError {
  override readonly name = "MetaMaskWrongChainError";
  readonly desiredHex: string;
  constructor(desiredHex: string) {
    super(
      "Couldn't switch the wallet to the requested chain. Switch it manually in MetaMask and try again.",
    );
    this.desiredHex = desiredHex;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────

export interface MetaMaskConnection {
  /** EIP-55 checksummed address (or lowercase — backend lowercases too). */
  address: string;
  /** Active chain id in 0x-hex form. Empty string when the request fails — chain mismatch is non-fatal for sign. */
  chainHex: string;
}

/**
 * Connect (or use the already-connected) EVM provider.
 *
 * Optionally attempts to switch the active chain to `desiredChainHex`
 * — useful when the user picked "Polygon" in our dropdown but their
 * wallet is on Ethereum. The switch is best-effort: if the wallet
 * refuses, we still return the connection (signature verification
 * doesn't depend on the active chain at the wallet, only on the
 * recovered address matching), so the user can still link.
 */
export async function connectMetaMask(
  desiredChainHex?: string,
): Promise<MetaMaskConnection> {
  const provider = window.ethereum;
  if (provider === undefined) {
    throw new MetaMaskUnavailableError();
  }

  let address: string;
  try {
    const accounts = await provider.request<string[]>({
      method: "eth_requestAccounts",
    });
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new MetaMaskError("No EVM accounts available.");
    }
    address = String(accounts[0]);
  } catch (err) {
    throw normalizeMetaMaskError(err, "connect");
  }

  // Best-effort chain switch. Errors here are non-fatal — we proceed
  // with whatever chain the wallet is on.
  if (desiredChainHex !== undefined && desiredChainHex !== "") {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: desiredChainHex }],
      });
    } catch {
      // Swallow — the user may have refused, or the chain may not be
      // configured in their wallet. Either way, fall back to whatever
      // chain is active.
    }
  }

  let chainHex = "";
  try {
    chainHex = await provider.request<string>({ method: "eth_chainId" });
  } catch {
    chainHex = "";
  }

  return { address, chainHex };
}

/**
 * Sign a UTF-8 challenge string with the EVM wallet using
 * `personal_sign`. Returns the raw 0x-prefixed hex signature the BCC
 * server's `EthSignatureVerifier` accepts.
 *
 * Caller is responsible for ensuring the wallet was already connected
 * (call `connectMetaMask` first).
 */
export async function signMetaMaskChallenge(
  signerAddress: string,
  message: string,
): Promise<{ signature: string }> {
  const provider = window.ethereum;
  if (provider === undefined) {
    throw new MetaMaskUnavailableError();
  }

  try {
    // Note the param order: [message, address]. MetaMask flipped this
    // historically — modern wallets accept the new (message, address)
    // order. The 0x-hex-encoded message is also accepted but plain
    // UTF-8 is fine and easier to reason about.
    const signature = await provider.request<string>({
      method: "personal_sign",
      params: [message, signerAddress],
    });
    if (typeof signature !== "string" || signature === "") {
      throw new MetaMaskError("Wallet returned an empty signature.");
    }
    return { signature };
  } catch (err) {
    throw normalizeMetaMaskError(err, "sign");
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function normalizeMetaMaskError(err: unknown, stage: WalletStage): MetaMaskError {
  // Already one of ours (deliberate copy, e.g. "No accounts" / "empty
  // signature" thrown inside the try): keep it, never genericise it.
  if (err instanceof MetaMaskError) return err;
  // EIP-1193 error code 4001 = user rejected. Other RPC errors expose
  // a message; pass it through with our typed wrapper so the UI can
  // branch on instanceof.
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: number }).code;
    if (code === 4001) {
      return new MetaMaskUserRejectedError(stage);
    }
    const message = (err as { message?: string }).message;
    if (typeof message === "string" && message !== "") {
      const lower = message.toLowerCase();
      if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel")) {
        return new MetaMaskUserRejectedError(stage);
      }
      return new MetaMaskError(WALLET_FAILED_COPY, { cause: err });
    }
  }
  return new MetaMaskError(WALLET_FAILED_COPY, { cause: err });
}
