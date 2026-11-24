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

// Keys are BCC slugs (`wp_bcc_chains.slug`). Values are Keplr's on-chain
// chain_id format. Cosmos Hub's BCC slug is `cosmos`; its Keplr chain_id
// stays `cosmoshub-4` (that's the real on-chain identifier, unrelated
// to BCC's vocabulary).
//
// THORChain rides this map — it's a Cosmos-SDK chain (secp256k1 +
// bech32 with the `thor` HRP) and the backend's CosmosSignatureVerifier
// derives the HRP from the address, so the same ADR-036 signing flow
// works without a separate verifier.
const COSMOS_CHAIN_IDS: Record<string, string> = {
  cosmos:    "cosmoshub-4",
  osmosis:   "osmosis-1",
  injective: "injective-1",
  juno:      "juno-1",
  thorchain: "thorchain-1",
  // Read from each chain's own node_info on 2026-11-04, not from memory.
  // Kujira is absent until a node answers: its seeded endpoints returned 502.
  akash:          "akashnet-2",
  cryptoorgchain: "crypto-org-chain-mainnet-1",
  jackal:         "jackal-1",
  dungeon:        "dungeon-1",
};

// Keplr's own list of natively integrated chains
// (keplr-chain-registry.vercel.app/api/native-chains, mainnetChains),
// checked 2026-11-24: every chain above is native except these two.
// Keplr only knows a non-native chain once the member has added it to
// their wallet; until then enable() fails with "There is no chain info
// for <chain id>" (F-569).
const KEPLR_NON_NATIVE: ReadonlySet<string> = new Set(["dungeon", "thorchain"]);

import { MOBILE_WALLET_HINT, WALLET_FAILED_COPY, walletRejectedCopy, type WalletStage } from "@/lib/wallet/error-copy";
import { findWalletChain } from "@/lib/wallet/chain-catalog";

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
  /** Where to get the wallet (rendered as a link by the claim flow). */
  readonly installUrl = "https://www.keplr.app/get";
  constructor() {
    super(`Keplr isn't installed in this browser. Install it to continue. ${MOBILE_WALLET_HINT}`);
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
  /** Declined at the connect prompt, or cancelled at signing. */
  readonly stage: WalletStage;
  constructor(stage: WalletStage = "sign") {
    super(walletRejectedCopy(stage));
    this.stage = stage;
  }
}

/**
 * The chain isn't in the member's Keplr (F-569). `confirmed` is true when
 * Keplr said so ("There is no chain info for …"); false when the connect
 * failed on a non-native chain for a reason Keplr didn't name, so the copy
 * offers adding the chain as the likely fix instead of asserting it.
 */
export class KeplrChainNotAddedError extends KeplrError {
  override readonly name = "KeplrChainNotAddedError";
  readonly slug: string;
  readonly confirmed: boolean;
  constructor(slug: string, confirmed: boolean, cause?: unknown) {
    const chain = findWalletChain(slug)?.label ?? slug;
    super(
      confirmed
        ? `${chain} isn't added to your Keplr yet. Add it from Keplr's chain list at chains.keplr.app, then try again.`
        : `Couldn't connect to ${chain} in Keplr. If it isn't added to your Keplr yet, add it from Keplr's chain list at chains.keplr.app, then try again.`,
      cause === undefined ? undefined : { cause },
    );
    this.slug = slug;
    this.confirmed = confirmed;
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
    throw chainNotAddedError(err, chainSlug) ?? normalizeKeplrError(err, "connect");
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
    throw normalizeKeplrError(err, "sign");
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * A connect failure that means (or, on a non-native chain, most likely
 * means) the chain isn't in the member's Keplr. Null for anything else,
 * including a declined prompt, which keeps its own copy.
 */
function chainNotAddedError(err: unknown, slug: string): KeplrChainNotAddedError | null {
  if (err instanceof KeplrError) return null;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  if (msg.includes("no chain info")) return new KeplrChainNotAddedError(slug, true, err);
  if (!KEPLR_NON_NATIVE.has(slug)) return null;
  if (msg.includes("reject") || msg.includes("cancel")) return null;
  return new KeplrChainNotAddedError(slug, false, err);
}

function normalizeKeplrError(err: unknown, stage: WalletStage): KeplrError {
  // Already one of ours (deliberate copy, e.g. "No accounts" / "empty
  // signature" thrown inside the try): keep it, never genericise it.
  if (err instanceof KeplrError) return err;
  // Keplr surfaces user rejection as an Error with message "Request rejected"
  // (or sometimes ".. is rejected"). Match loosely.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("reject") || msg.includes("cancel")) {
      return new KeplrUserRejectedError(stage);
    }
    return new KeplrError(WALLET_FAILED_COPY, { cause: err });
  }
  return new KeplrError(WALLET_FAILED_COPY, { cause: err });
}
