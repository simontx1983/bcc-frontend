/**
 * F-316 M-cl2 (UX scan claims): wallet errors as the member reads them.
 *   - a wallet's own error text is never shown (kept as `cause`);
 *   - declining the CONNECT prompt is not "signing was canceled";
 *   - "not installed" says what to do on a phone and carries an install URL;
 *   - an adapter's own deliberate copy ("No EVM accounts available.") survives.
 * Drives the real Keplr and MetaMask adapters against stubbed providers.
 */

import { afterEach, describe, expect, it } from "vitest";

import { MOBILE_WALLET_HINT, WALLET_FAILED_COPY } from "@/lib/wallet/error-copy";
import { humanizeWalletProviderError, walletInstallUrl } from "@/lib/wallet/dispatch";
import { connectKeplr, KeplrUnavailableError, signKeplrChallenge } from "@/lib/wallet/keplr";
import { connectMetaMask, signMetaMaskChallenge } from "@/lib/wallet/metamask";
import { PhantomUserRejectedError } from "@/lib/wallet/phantom";
import { PolkadotUnavailableError, PolkadotUserRejectedError } from "@/lib/wallet/polkadot";

// Partial provider stubs: the global window types want full objects.
const w = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete w["keplr"];
  delete w["ethereum"];
});

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected a rejection");
}

describe("Keplr", () => {
  it("declining the connect prompt reads as a declined connection", async () => {
    w["keplr"] = { enable: () => Promise.reject(new Error("Request rejected")) };
    const err = await caught(connectKeplr("cosmos"));
    expect(humanizeWalletProviderError(err)).toBe("You declined the wallet connection.");
  });

  it("cancelling the signature reads as a cancelled signature", async () => {
    w["keplr"] = { signArbitrary: () => Promise.reject(new Error("Request rejected")) };
    const err = await caught(signKeplrChallenge("cosmos", "cosmos1abc", "msg"));
    expect(humanizeWalletProviderError(err)).toBe("Wallet signing was canceled.");
  });

  it("a raw extension error is never shown; the original is kept as the cause", async () => {
    const raw = new Error("RAW EXTENSION TEXT: rpc 0xdeadbeef failed");
    w["keplr"] = { enable: () => Promise.reject(raw) };
    const err = await caught(connectKeplr("cosmos"));
    expect(humanizeWalletProviderError(err)).toBe(WALLET_FAILED_COPY);
    expect((err as Error).cause).toBe(raw);
  });

  it("not installed: phone guidance and an install URL", async () => {
    const err = await caught(connectKeplr("cosmos"));
    expect(err).toBeInstanceOf(KeplrUnavailableError);
    expect(humanizeWalletProviderError(err)).toContain(MOBILE_WALLET_HINT);
    expect(walletInstallUrl(err)).toBe("https://www.keplr.app/get");
  });
});

describe("MetaMask", () => {
  it("connect decline (EIP-1193 4001) vs signature cancel", async () => {
    w["ethereum"] = { request: () => Promise.reject({ code: 4001, message: "User rejected the request." }) };
    expect(humanizeWalletProviderError(await caught(connectMetaMask()))).toBe(
      "You declined the wallet connection.",
    );
    expect(humanizeWalletProviderError(await caught(signMetaMaskChallenge("0xabc", "msg")))).toBe(
      "Wallet signing was canceled.",
    );
  });

  it("its own deliberate copy survives (thrown inside the try)", async () => {
    w["ethereum"] = { request: () => Promise.resolve([]) };
    expect(humanizeWalletProviderError(await caught(connectMetaMask()))).toBe(
      "No EVM accounts available.",
    );
  });

  it("an RPC error's raw message is never shown", async () => {
    w["ethereum"] = { request: () => Promise.reject({ code: -32603, message: "RAW RPC: execution reverted" }) };
    expect(humanizeWalletProviderError(await caught(connectMetaMask()))).toBe(WALLET_FAILED_COPY);
  });
});

describe("the other adapters share the same copy", () => {
  it("Phantom and Polkadot rejections are stage-aware; Polkadot has an install URL", () => {
    expect(humanizeWalletProviderError(new PhantomUserRejectedError("connect"))).toBe(
      "You declined the wallet connection.",
    );
    expect(humanizeWalletProviderError(new PolkadotUserRejectedError("sign"))).toBe(
      "Wallet signing was canceled.",
    );
    expect(walletInstallUrl(new PolkadotUnavailableError())).toBe("https://polkadot.js.org/extension/");
    expect(walletInstallUrl(new Error("x"))).toBeNull();
  });
});
