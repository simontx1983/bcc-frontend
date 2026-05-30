"use client";

/**
 * Polkadot / Substrate wallet helper — the EVM/Solana/Cosmos
 * counterpart to metamask.ts / phantom.ts / keplr.ts.
 *
 * V1 covers Polkadot mainnet via the `window.injectedWeb3` provider
 * surface that Polkadot.js extension, Talisman, SubWallet, Nova, and
 * other Substrate-aware wallets all expose. No `@polkadot/extension-
 * dapp` or `@polkadot/util-crypto` deps on the client — those are
 * server-only (the Next.js verifier route does the cryptographic
 * verification; the wallet handles its own address + signature
 * encoding).
 *
 * Why no @polkadot/* deps in the browser bundle:
 *   The Polkadot ecosystem libraries are large (multiple megabytes
 *   when transitive deps are counted). The wallet extensions
 *   themselves implement the same provider-discovery surface that
 *   `@polkadot/extension-dapp` wraps; using it directly keeps the
 *   bundle on parity with the keplr / phantom / metamask adapters
 *   (each of which is a thin wrapper around its injected global).
 *
 * Signing protocol:
 *   signRaw with type='bytes' instructs the wallet to wrap the data
 *   with <Bytes>…</Bytes> before signing. The signature is over the
 *   wrapped form. The Next.js verifier route attempts verification
 *   against the wrapped form first and falls back to the bare form,
 *   so wallets that don't wrap (rare) still work.
 *
 * Per §N1: provider names appear in the user-facing tooltip; the API
 * surface stays neutral.
 */

// ─────────────────────────────────────────────────────────────────────
// Type declarations for window.injectedWeb3 — sliced to the surface
// we actually call. The Polkadot extension-dapp library types this
// more elaborately; we mirror only what we need.
// ─────────────────────────────────────────────────────────────────────

interface PolkadotAccount {
  /** SS58-encoded address. Network prefix is decided by the wallet. */
  address: string;
  /** Human-readable account label set by the user (optional). */
  name?: string;
}

interface PolkadotSignerPayload {
  /** Plain UTF-8 challenge string (NOT 0x-hex). */
  data: string;
  /** Account address that should sign. */
  address: string;
  /** Always 'bytes' for our flow — instructs the wallet to wrap with <Bytes>. */
  type: "bytes";
}

interface PolkadotSignerResult {
  /** 0x-prefixed hex signature. */
  signature: string;
}

interface PolkadotSigner {
  signRaw(payload: PolkadotSignerPayload): Promise<PolkadotSignerResult>;
}

interface PolkadotInjected {
  accounts: {
    get(): Promise<PolkadotAccount[]>;
  };
  signer: PolkadotSigner;
}

interface PolkadotInjector {
  enable(dappName: string): Promise<PolkadotInjected>;
  version?: string;
}

declare global {
  interface Window {
    injectedWeb3?: Record<string, PolkadotInjector>;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Errors — typed family parallels the other wallet adapters so the UI
// can render specific copy via instanceof checks.
// ─────────────────────────────────────────────────────────────────────

export class PolkadotError extends Error {
  override readonly name: string = "PolkadotError";
}

export class PolkadotUnavailableError extends PolkadotError {
  override readonly name = "PolkadotUnavailableError";
  constructor() {
    super(
      "Polkadot.js / Talisman / SubWallet / Nova not detected. Install a Substrate-compatible wallet to continue.",
    );
  }
}

export class PolkadotUserRejectedError extends PolkadotError {
  override readonly name = "PolkadotUserRejectedError";
  constructor() {
    super("Wallet signing was canceled.");
  }
}

export class PolkadotNoAccountsError extends PolkadotError {
  override readonly name = "PolkadotNoAccountsError";
  constructor() {
    super(
      "No Polkadot accounts found. Create or import one in your wallet, then retry.",
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────

export interface PolkadotConnection {
  /** SS58 address. */
  address: string;
  /** Provider key from window.injectedWeb3 — debug-only ("polkadot-js" / "talisman" / etc.). */
  source: string;
}

/** Dapp name surfaced to the wallet's permission prompt. */
const DAPP_NAME = "Blue Collar Crypto";

/**
 * Pinned injected-wallet reference from the most recent successful
 * connectPolkadot() call, keyed by source. signPolkadotChallenge
 * reuses this instead of re-resolving via `window.injectedWeb3[source]`
 * — because the Substrate-family injector registry is a Record that
 * any extension can mutate (Backpack, Namada, etc. routinely
 * override or wrap entries even when the user doesn't intend them to
 * handle the request). Pinning at connect time guarantees the second
 * signature in the wallet-signup flow goes to the same provider that
 * issued the address, regardless of what window.injectedWeb3 looks
 * like at sign time.
 *
 * Module-level state is fine here: scope is one browser tab; cache
 * is most-recent-wins (multiple concurrent connect calls just update
 * the entry); on page navigation the module unloads with everything
 * else.
 */
const pinnedInjected: Map<string, PolkadotInjected> = new Map();

/**
 * Discover an injected Substrate wallet, request access, and return
 * the first account. Throws `PolkadotUnavailableError` when no
 * provider is present and `PolkadotUserRejectedError` when the user
 * dismisses the permission prompt.
 *
 * Provider discovery preference order: polkadot-js → talisman → subwallet-js
 * → nova-wallet → anything else. This mirrors the order users tend to
 * install — the first match wins. Future work could let the user pick
 * a provider via a sub-menu; V1 keeps the surface minimal.
 */
export async function connectPolkadot(): Promise<PolkadotConnection> {
  const injectors = typeof window !== "undefined" ? window.injectedWeb3 : undefined;
  if (injectors === undefined || Object.keys(injectors).length === 0) {
    throw new PolkadotUnavailableError();
  }

  const sourceKey = pickProvider(injectors);
  const injector = injectors[sourceKey];
  if (injector === undefined) {
    throw new PolkadotUnavailableError();
  }

  let injected: PolkadotInjected;
  try {
    injected = await injector.enable(DAPP_NAME);
  } catch (err) {
    throw normalizePolkadotError(err);
  }

  let accounts: PolkadotAccount[];
  try {
    accounts = await injected.accounts.get();
  } catch (err) {
    throw normalizePolkadotError(err);
  }
  if (accounts.length === 0) {
    throw new PolkadotNoAccountsError();
  }

  const first = accounts[0];
  if (first === undefined || first.address === "") {
    throw new PolkadotNoAccountsError();
  }

  // Pin the injected reference so signPolkadotChallenge can reuse it
  // without going through window.injectedWeb3 again.
  pinnedInjected.set(sourceKey, injected);

  return { address: first.address, source: sourceKey };
}

/**
 * Sign a UTF-8 challenge string with the active Substrate wallet.
 * Returns the 0x-prefixed hex signature the BCC server's
 * `PolkadotSignatureVerifier` (via the Next.js verify route)
 * accepts.
 *
 * Reuses the pinned `injected` reference from connectPolkadot() so
 * other extensions overwriting `window.injectedWeb3[source]` between
 * connect and sign cannot redirect the signing request to a different
 * wallet (which would produce a signature for a different pubkey and
 * fail server-side verification). On cache miss (page reload between
 * connect and sign, or sign called without a prior connect) we fall
 * back to the original re-resolution path.
 *
 * Caller is responsible for ensuring `connectPolkadot()` ran first
 * AND for passing the same source the connect call returned.
 */
export async function signPolkadotChallenge(
  source: string,
  signerAddress: string,
  message: string,
): Promise<{ signature: string }> {
  let injected: PolkadotInjected;
  const pinned = pinnedInjected.get(source);
  if (pinned !== undefined) {
    injected = pinned;
  } else {
    // Fallback: cache miss. Resolve via window.injectedWeb3 as the
    // adapter originally did. Reaching this branch means either the
    // page reloaded between connect and sign or the caller violated
    // the "connect first" contract.
    const injectors = typeof window !== "undefined" ? window.injectedWeb3 : undefined;
    if (injectors === undefined) {
      throw new PolkadotUnavailableError();
    }
    const injector = injectors[source];
    if (injector === undefined) {
      throw new PolkadotUnavailableError();
    }
    try {
      injected = await injector.enable(DAPP_NAME);
    } catch (err) {
      throw normalizePolkadotError(err);
    }
    pinnedInjected.set(source, injected);
  }

  try {
    const { signature } = await injected.signer.signRaw({
      type: "bytes",
      data: message,
      address: signerAddress,
    });
    if (typeof signature !== "string" || signature === "") {
      throw new PolkadotError("Wallet returned an empty signature.");
    }
    return { signature };
  } catch (err) {
    throw normalizePolkadotError(err);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const PROVIDER_PRIORITY: ReadonlyArray<string> = [
  "polkadot-js",
  "talisman",
  "subwallet-js",
  "nova-wallet",
];

function pickProvider(injectors: Record<string, PolkadotInjector>): string {
  for (const key of PROVIDER_PRIORITY) {
    if (key in injectors) {
      return key;
    }
  }
  // Fall back to whatever's there — covers future wallets we don't
  // know by name. Object.keys order is insertion order, which on
  // every modern browser matches injection order.
  const keys = Object.keys(injectors);
  return keys[0] ?? "polkadot-js";
}

function normalizePolkadotError(err: unknown): PolkadotError {
  // The polkadot.js extension surfaces user rejection as either a
  // string starting with "Rejected" or an Error with that message.
  // Loose match across implementations.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
      return new PolkadotUserRejectedError();
    }
    return new PolkadotError(err.message);
  }
  if (typeof err === "string") {
    const lower = err.toLowerCase();
    if (lower.includes("reject") || lower.includes("denied") || lower.includes("cancel")) {
      return new PolkadotUserRejectedError();
    }
    return new PolkadotError(err);
  }
  return new PolkadotError("Wallet error.");
}
