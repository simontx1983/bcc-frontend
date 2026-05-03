"use client";

/**
 * Keplr wallet helper — minimal wrapper around `window.keplr` for the
 * §N8 Cosmos validator claim flow.
 *
 * V1 scope: ADR-036 `signArbitrary` only. The challenge from the BCC
 * server is a plain UTF-8 string; we sign it with the wallet's bech32
 * address on the requested chain. The resulting `{signature, pub_key}`
 * pair is forwarded to /auth/wallet-link as base64 strings — server
 * verification lives in `BCC\Core\Crypto\WalletVerifier` (no client-
 * side cryptography).
 *
 * Why no @cosmjs deps:
 *   The frontend never decodes signatures or addresses. Keplr returns
 *   pre-encoded base64 strings; we pass them through. Adding cosmjs
 *   would bloat the bundle without any code path consuming it.
 *
 * Per §N1: "Keplr" appears in the user-facing tooltip ("Sign with
 * Keplr"); the API surface stays neutral so we can add MetaMask /
 * Phantom variants without renaming.
 */

// ─────────────────────────────────────────────────────────────────────
// Type declaration for `window.keplr` — sliced down to the surface we
// actually call. Keplr publishes @keplr-wallet/types but we don't want
// the dep churn for three method shapes.
// ─────────────────────────────────────────────────────────────────────

interface KeplrKey {
  /** bech32 address on the requested chain. */
  bech32Address: string;
  /** secp256k1 public key as Uint8Array. Base64-encoded for transport. */
  pubKey: Uint8Array;
}

interface KeplrSignature {
  /** base64 — what the server's WalletVerifier consumes. */
  signature: string;
  pub_key: {
    type: string;
    /** base64 secp256k1 public key. */
    value: string;
  };
}

interface KeplrApi {
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<KeplrKey>;
  signArbitrary(
    chainId: string,
    signer: string,
    data: string
  ): Promise<KeplrSignature>;
}

declare global {
  interface Window {
    keplr?: KeplrApi;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Chain slug → chain id
//
// The BCC server identifies chains by slug; Keplr identifies them by
// chain_id (the actual on-chain identifier — e.g. "cosmoshub-4"). We
// resolve here so the rest of the codebase stays slug-only.
//
// V1 covers the chains BCC indexes today. New chains add a single
// entry; the claim flow surface stays unchanged.
// ─────────────────────────────────────────────────────────────────────

const COSMOS_CHAIN_IDS: Record<string, string> = {
  cosmoshub: "cosmoshub-4",
  osmosis:   "osmosis-1",
  injective: "injective-1",
  juno:      "juno-1",
  stargaze:  "stargaze-1",
};

export function isCosmosChain(slug: string): boolean {
  return slug in COSMOS_CHAIN_IDS;
}

function chainIdForSlug(slug: string): string {
  const id = COSMOS_CHAIN_IDS[slug];
  if (id === undefined) {
    throw new KeplrUnsupportedChainError(slug);
  }
  return id;
}

// ─────────────────────────────────────────────────────────────────────
// Errors — a small typed family so the UI can render specific messages
// (per §L2 every action handles failure with clear feedback).
// ─────────────────────────────────────────────────────────────────────

export class KeplrError extends Error {
  override readonly name: string = "KeplrError";
}

export class KeplrUnavailableError extends KeplrError {
  override readonly name = "KeplrUnavailableError";
  constructor() {
    super("Keplr extension not detected. Install Keplr to continue.");
  }
}

export class KeplrUnsupportedChainError extends KeplrError {
  override readonly name = "KeplrUnsupportedChainError";
  readonly slug: string;
  constructor(slug: string) {
    super(`Chain "${slug}" is not yet supported by the claim flow.`);
    this.slug = slug;
  }
}

export class KeplrUserRejectedError extends KeplrError {
  override readonly name = "KeplrUserRejectedError";
  constructor() {
    super("Signing was canceled.");
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────

export interface KeplrConnection {
  address: string;
  chainSlug: string;
  /** opaque to the caller — handy for debug surfaces. */
  chainId: string;
}

/**
 * Prompt Keplr to enable the chain and return the active address.
 * Throws KeplrUnavailableError when the extension isn't installed,
 * KeplrUnsupportedChainError when the slug isn't in our map, and
 * KeplrUserRejectedError when the user declines the popup.
 */
export async function connectKeplr(chainSlug: string): Promise<KeplrConnection> {
  const keplr = window.keplr;
  if (keplr === undefined) {
    throw new KeplrUnavailableError();
  }

  const chainId = chainIdForSlug(chainSlug);

  try {
    await keplr.enable(chainId);
    const key = await keplr.getKey(chainId);
    return {
      address:   key.bech32Address,
      chainSlug,
      chainId,
    };
  } catch (err) {
    throw normalizeKeplrError(err);
  }
}

/**
 * Sign a UTF-8 challenge string with the active Cosmos wallet using
 * ADR-036. Returns the base64 signature + base64 pubkey pair the
 * BCC server's `/auth/wallet-link` accepts.
 *
 * Caller is responsible for ensuring the wallet was already connected
 * (call `connectKeplr` first).
 */
export async function signKeplrChallenge(
  chainSlug: string,
  signerAddress: string,
  message: string
): Promise<{ signature: string; pubKey: string }> {
  const keplr = window.keplr;
  if (keplr === undefined) {
    throw new KeplrUnavailableError();
  }

  const chainId = chainIdForSlug(chainSlug);

  try {
    const result = await keplr.signArbitrary(chainId, signerAddress, message);
    return {
      signature: result.signature,
      pubKey:    result.pub_key.value,
    };
  } catch (err) {
    throw normalizeKeplrError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function normalizeKeplrError(err: unknown): KeplrError {
  // Keplr surfaces user rejection as an Error with message "Request rejected"
  // (or sometimes ".. is rejected"). Match loosely.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("reject") || msg.includes("cancel")) {
      return new KeplrUserRejectedError();
    }
    return new KeplrError(err.message);
  }
  return new KeplrError("Wallet error.");
}
