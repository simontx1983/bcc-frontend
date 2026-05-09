"use client";

/**
 * Phantom / Solana wallet helper — the Solana counterpart to keplr.ts.
 *
 * Covers the link flow for Solana via Phantom (and any wallet that
 * mirrors Phantom's `window.solana` surface — Solflare, Backpack, etc.).
 * Phantom's `signMessage` returns an Ed25519 signature over the raw
 * UTF-8 bytes of the message. The backend's
 * `SolanaSignatureVerifier::verify` decodes the signature and address
 * as base58 and uses libsodium to verify.
 *
 * The base58 alphabet is the standard Bitcoin/Solana one
 * `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`. We
 * encode the signature inline (one short helper) rather than pulling
 * in `bs58` — the encode path is tiny and the import would dwarf the
 * code it ships.
 *
 * No external deps. The whole file uses only the Phantom provider
 * surface and `Uint8Array` ops; the backend does all the cryptography.
 *
 * Per §N1: "Phantom" appears in the user-facing tooltip; the API
 * surface stays neutral so we can swap in @solana/wallet-adapter
 * later without renaming.
 */

// ─────────────────────────────────────────────────────────────────────
// Phantom provider type — the slice of window.solana we actually use.
// Phantom's PublicKey is opaque-but-supports-toString(); we treat it
// as such to avoid pulling in @solana/web3.js for one method.
// ─────────────────────────────────────────────────────────────────────

interface PhantomPublicKey {
  toString(): string;
  toBase58?(): string;
}

interface PhantomConnectResponse {
  publicKey: PhantomPublicKey;
}

interface PhantomSignMessageResponse {
  signature: Uint8Array;
  publicKey?: PhantomPublicKey;
}

interface PhantomProvider {
  isPhantom?: boolean;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<PhantomConnectResponse>;
  signMessage(
    message: Uint8Array,
    encoding?: "utf8",
  ): Promise<PhantomSignMessageResponse>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Errors — typed family parallels keplr.ts / metamask.ts.
// ─────────────────────────────────────────────────────────────────────

export class PhantomError extends Error {
  override readonly name: string = "PhantomError";
}

export class PhantomUnavailableError extends PhantomError {
  override readonly name = "PhantomUnavailableError";
  constructor() {
    super("Phantom (or another Solana wallet) not detected. Install one to continue.");
  }
}

export class PhantomUserRejectedError extends PhantomError {
  override readonly name = "PhantomUserRejectedError";
  constructor() {
    super("Wallet signing was canceled.");
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────

export interface PhantomConnection {
  /** base58 wallet address (== Solana public key). */
  address: string;
}

/**
 * Prompt Phantom to connect. Throws `PhantomUnavailableError` when no
 * provider is injected and `PhantomUserRejectedError` when the user
 * declines the popup.
 */
export async function connectPhantom(): Promise<PhantomConnection> {
  const provider = window.solana;
  if (provider === undefined) {
    throw new PhantomUnavailableError();
  }

  try {
    const response = await provider.connect();
    return { address: pkToBase58(response.publicKey) };
  } catch (err) {
    throw normalizePhantomError(err);
  }
}

/**
 * Sign a UTF-8 challenge string with the Solana wallet. Returns the
 * base58-encoded signature the BCC server's `SolanaSignatureVerifier`
 * accepts.
 *
 * Caller is responsible for ensuring the wallet was already connected
 * (call `connectPhantom` first).
 */
export async function signPhantomChallenge(
  message: string,
): Promise<{ signature: string }> {
  const provider = window.solana;
  if (provider === undefined) {
    throw new PhantomUnavailableError();
  }

  try {
    const encoded = new TextEncoder().encode(message);
    const result = await provider.signMessage(encoded, "utf8");
    if (!(result.signature instanceof Uint8Array) || result.signature.length === 0) {
      throw new PhantomError("Wallet returned an empty signature.");
    }
    return { signature: base58Encode(result.signature) };
  } catch (err) {
    throw normalizePhantomError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — base58 encode, public-key → string, error normaliser.
// ─────────────────────────────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Base58 encode a byte array using the Bitcoin/Solana alphabet.
 * Faithful to the reference implementation: leading zero bytes are
 * preserved as leading "1" characters (the alphabet's zero), the
 * rest is straight big-integer base conversion.
 */
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  // Count leading zero bytes — those become leading "1"s.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++;
  }

  // Convert base-256 → base-58.
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0;
    for (let j = 0; j < digits.length; j++) {
      carry += (digits[j] ?? 0) * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let out = "";
  for (let i = 0; i < zeros; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) {
    out += BASE58_ALPHABET[digits[i] ?? 0];
  }
  return out;
}

function pkToBase58(pk: PhantomPublicKey): string {
  // Phantom's PublicKey objects expose toBase58() in newer versions and
  // toString() in older ones (which also returns the base58 string).
  if (typeof pk.toBase58 === "function") {
    return pk.toBase58();
  }
  return pk.toString();
}

function normalizePhantomError(err: unknown): PhantomError {
  // Phantom's user-rejection error has code 4001 (mirrors EIP-1193).
  if (typeof err === "object" && err !== null) {
    const code = (err as { code?: number }).code;
    if (code === 4001) {
      return new PhantomUserRejectedError();
    }
    const message = (err as { message?: string }).message;
    if (typeof message === "string" && message !== "") {
      const lower = message.toLowerCase();
      if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel")) {
        return new PhantomUserRejectedError();
      }
      return new PhantomError(message);
    }
  }
  return new PhantomError("Wallet error.");
}
